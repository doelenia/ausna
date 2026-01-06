-- Create enum for legal document types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'legal_document_type') THEN
    CREATE TYPE legal_document_type AS ENUM ('terms', 'privacy');
  END IF;
END$$;

-- Table to store legal documents (Terms & Conditions, Privacy Policy) with versioning
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type legal_document_type NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT unique_active_per_type UNIQUE (type, is_active) DEFERRABLE INITIALLY IMMEDIATE
);

-- Ensure one active version per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_documents_type_version
  ON legal_documents(type, version);

COMMENT ON TABLE legal_documents IS 'Versioned legal documents such as Terms & Conditions and Privacy Policy';

-- Table to track which users agreed to which versions of which documents
CREATE TABLE IF NOT EXISTS user_legal_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type legal_document_type NOT NULL,
  document_version INTEGER NOT NULL,
  agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  CONSTRAINT unique_user_document_version UNIQUE (user_id, document_type, document_version)
);

CREATE INDEX IF NOT EXISTS idx_user_legal_agreements_user_id
  ON user_legal_agreements(user_id);

CREATE INDEX IF NOT EXISTS idx_user_legal_agreements_document
  ON user_legal_agreements(document_type, document_version);

COMMENT ON TABLE user_legal_agreements IS 'Tracks which users agreed to which versions of legal documents and when';

-- Enable Row Level Security
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_legal_agreements ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone (including unauthenticated) can read active legal documents
CREATE POLICY "Anyone can view legal documents"
  ON legal_documents FOR SELECT
  USING (true);

-- RLS: Only admins can insert/update/delete legal documents
CREATE POLICY "Admins manage legal documents"
  ON legal_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  );

-- RLS: Users can view their own agreements
CREATE POLICY "Users can view their own legal agreements"
  ON user_legal_agreements FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Users can create their own legal agreements
CREATE POLICY "Users can create their own legal agreements"
  ON user_legal_agreements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: Admins can view all user legal agreements
CREATE POLICY "Admins can view all legal agreements"
  ON user_legal_agreements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  );

-- Seed initial Terms & Conditions (version 1)
INSERT INTO legal_documents (type, version, content, effective_date, is_active)
VALUES (
  'terms',
  1,
  $terms$
Ausna Terms & Conditions

Last updated: 2026-01-06

1. Acceptance of Terms
By creating an account, accessing, or using Ausna (the "Service"), you agree to be bound by these Terms & Conditions (the "Terms"). If you do not agree to these Terms, you may not use the Service.

If you are using the Service on behalf of an organization, you represent and warrant that you are authorized to bind that organization to these Terms, and "you" refers to both you and that organization.

2. Account Registration and Eligibility
2.1 Eligibility
You must be at least 13 years old to use the Service. If you are between 13 and 18 (or the age of majority in your jurisdiction), you may only use the Service with the consent of a parent or legal guardian.

2.2 Account Creation
To use certain features, you must create an account using a valid email address and password or via a supported OAuth provider (such as Google or Apple). You agree to provide accurate, current, and complete information during registration and to keep this information up to date.

2.3 Waitlist and Approval
Ausna may use a waitlist and approval process before allowing users to complete registration. Joining the waitlist does not guarantee that you will be approved or granted access. Ausna may approve, reject, or remove users from the waitlist or the Service at its sole discretion.

2.4 Account Security
You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must promptly notify us of any unauthorized use of your account or any other breach of security. Ausna is not liable for any loss or damage arising from your failure to safeguard your account.

3. User Accounts and Human Portfolios
3.1 Human Portfolios
When you create an account, Ausna automatically creates a "human portfolio" associated with your user ID. Your human portfolio may include information such as your username, display name, avatar, biography, interests, and other metadata related to your creative work.

3.2 Username and Profile Information
You may be able to select a username and customize profile information. Usernames must be unique and must comply with our community standards. Ausna reserves the right to reclaim or change usernames that violate these Terms, infringe third-party rights, or are otherwise inappropriate.

3.3 Multiple Portfolio Types
In addition to your human portfolio, you may create other portfolio types (such as project or community portfolios). These portfolios may have different roles (e.g., owner, manager, member) and permissions. You are responsible for the content and activity within portfolios that you own or manage.

3.4 Account Termination
You may request to delete your account at any time, subject to our data retention obligations described in the Privacy Policy. We may suspend or terminate your account or access to the Service if you violate these Terms, misuse the Service, or engage in harmful behavior, with or without notice.

4. Content and Notes
4.1 User-Generated Content
Ausna enables you to create, upload, and share various forms of content, including notes, images, URLs, messages, comments, and portfolio metadata (collectively, "User Content"). You retain ownership of your User Content, subject to the license granted to Ausna below.

4.2 License You Grant to Ausna
By submitting, posting, or displaying User Content on or through the Service, you grant Ausna a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, host, store, reproduce, modify, adapt, publish, display, perform, and distribute such User Content solely for the purpose of operating, improving, and providing the Service (including indexing, search, feed ranking, recommendations, and safety systems).

4.3 Visibility of Content
Depending on the settings of your portfolio or note, your User Content may be visible to:
- Only you (private content),
- Members of specific portfolios or communities,
- Other users you connect or collaborate with, or
- The broader Ausna community.

You are responsible for selecting appropriate visibility settings and for understanding that content shared in more public contexts may be visible to more users.

4.4 Prohibited Content
You agree not to submit any User Content that:
- Is illegal, abusive, harassing, threatening, or defamatory;
- Promotes hate, discrimination, or violence;
- Contains sexually explicit material involving minors or otherwise violates child protection laws;
- Infringes or misappropriates any third-party rights, including intellectual property or privacy rights;
- Constitutes spam, scams, or deceptive practices; or
- Contains malicious code or attempts to interfere with or disrupt the Service.

Ausna may remove or restrict access to any User Content that it reasonably believes violates these Terms or applicable law.

5. Messages and Communications
5.1 Private Messaging
The Service may allow you to send messages to other users. You are solely responsible for the content of your communications. You agree not to use messaging features to harass, spam, or harm others.

5.2 AI-Assisted Features
Some features (such as note indexing, interest tracking, or conversation completion) may rely on external AI services. While we aim to improve your experience through these features, you acknowledge that AI-generated insights or suggestions may not always be accurate or appropriate.

6. Subscriptions and Follows
Ausna may allow users to subscribe to or follow portfolios (including human, project, or community portfolios). Subscribing enables you to receive updates or content from those portfolios. Ausna does not guarantee any particular volume, quality, or frequency of content as a result of subscribing.

7. Acceptable Use and User Conduct
You agree not to:
- Use the Service for any unlawful purpose;
- Impersonate any person or entity or misrepresent your affiliation with a person or entity;
- Attempt to gain unauthorized access to, interfere with, or disrupt the integrity or performance of the Service or related systems;
- Use automated means (such as bots or scrapers) to access the Service without our prior written consent;
- Reverse engineer or attempt to extract the source code of the Service, except where permitted by law;
- Bypass or circumvent any security or access controls of the Service.

We may investigate and take appropriate action (including account suspension or termination) in response to violations of this section.

8. Intellectual Property
8.1 Ausna’s Rights
The Service, including all software, design, text, graphics, logos, and other materials (excluding User Content) are owned by or licensed to Ausna and are protected by copyright, trademark, and other laws. Except for the limited rights expressly granted to you under these Terms, Ausna reserves all rights in and to the Service.

8.2 Feedback
If you provide feedback, suggestions, or ideas about the Service ("Feedback"), you grant Ausna a perpetual, worldwide, irrevocable, royalty-free license to use, modify, and incorporate such Feedback into the Service without obligation or compensation to you.

9. Privacy
Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, and protect your personal information. By using the Service, you acknowledge that you have read and understood the Privacy Policy.

10. Third-Party Services
The Service integrates with third-party providers such as:
- Supabase for authentication, database, and storage;
- OpenAI for content analysis, embeddings, and AI-assisted features; and
- OAuth providers (such as Google or Apple) for account login.

Your use of these third-party services may be subject to their own terms and privacy policies. Ausna is not responsible for the practices of third-party services.

11. Disclaimers
The Service is provided on an \"as is\" and \"as available\" basis, without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.

Ausna does not warrant that the Service will be uninterrupted, secure, or error-free, or that any content will be accurate, complete, or reliable. You use the Service at your own risk.

12. Limitation of Liability
To the maximum extent permitted by law, Ausna and its affiliates, officers, employees, agents, and partners shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting from:
- Your access to or use of or inability to access or use the Service;
- Any conduct or content of any third party on the Service;
- Any content obtained from the Service; or
- Unauthorized access, use, or alteration of your transmissions or content.

In no event shall Ausna’s aggregate liability exceed the greater of (a) the amount you paid to Ausna for the Service in the twelve (12) months preceding the event giving rise to the claim or (b) one hundred US dollars (US$100).

13. Changes to the Service and Terms
We may update or modify the Service, introduce new features, or discontinue features from time to time. We may also update these Terms. When we make material changes, we will provide notice by updating the \"Last updated\" date, posting a notice in the Service, or sending you an email.

Your continued use of the Service after the effective date of any changes constitutes your acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Service.

14. Governing Law and Dispute Resolution
These Terms are governed by and construed in accordance with the laws of the jurisdiction where Ausna is primarily operated, without regard to its conflict of law principles. Any disputes arising out of or relating to these Terms or the Service shall be resolved in the courts located in that jurisdiction, except where applicable law requires a different venue.

15. Contact Information
If you have any questions about these Terms, you may contact us at:
[Insert contact email or web form URL]
$terms$
  ,
  NOW(),
  true
),
-- Seed initial Privacy Policy (version 1)
(
  'privacy',
  1,
  $privacy$
Ausna Privacy Policy

Last updated: 2026-01-06

1. Introduction
This Privacy Policy explains how Ausna (\"we\", \"us\", or \"our\") collects, uses, shares, and protects information about you when you use our website, applications, and services (collectively, the \"Service\").

By using the Service, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree with this policy, please do not use the Service.

2. Information We Collect
We collect different types of information depending on how you use the Service.

2.1 Account Information
When you create an account, we collect:
- Email address;
- Password (stored in hashed form by our authentication provider);
- Optional username; and
- Information provided by OAuth providers (such as Google or Apple), which may include your name, email address, and profile image.

2.2 Profile and Portfolio Information
When you create or update your human portfolio or other portfolios, we collect information such as:
- Display name, biography, and other profile details;
- Portfolio metadata (e.g., project or community descriptions);
- Avatar or other images you choose to upload; and
- Links, tags, and interests you associate with your work.

2.3 Content You Create
We collect the content you create and interact with, including:
- Notes, annotations, images, URLs, and references;
- Messages you send or receive through the Service;
- Comments or other contributions you make in portfolios or communities.

2.4 Usage and Interaction Data
We collect information about how you use the Service, such as:
- Pages and portfolios you view;
- Notes you create, read, or interact with;
- Subscriptions, follows, and membership in portfolios or communities;
- Time, frequency, and duration of your activities.

We may use this data to infer topics or interests through automated processing and AI-driven analysis to help personalize your experience.

2.5 Technical and Log Data
When you access the Service, we automatically collect certain technical information, such as:
- IP address;
- Browser type and version;
- Device type and operating system;
- Referring URLs;
- Date and time of requests; and
- Error logs and performance data.

3. How We Use Your Information
We use the information we collect for the following purposes:

3.1 Providing and Maintaining the Service
- To create and manage your account and portfolios;
- To provide core features such as note creation, indexing, messaging, and feeds;
- To authenticate you and maintain your sessions.

3.2 Personalization and Recommendations
- To generate and refine your feed based on your activity and interests;
- To suggest topics, portfolios, or content that may be relevant to you;
- To display your interests and relevant tags in your portfolios.

3.3 AI-Assisted Processing
We use third-party AI services (such as OpenAI) to:
- Analyze your notes and content to generate summaries and embeddings;
- Extract topics, intentions, and other structured data from text;
- Improve search, discovery, and interest tracking.

When we send content to these services, we take steps to limit the data to what is necessary for the specific feature and to protect your privacy in accordance with this policy and our agreements with those providers.

3.4 Communication
- To send you transactional emails (such as account verification, security alerts, and important updates);
- To respond to your support requests and inquiries;
- To provide notifications related to your activity on the Service (subject to your preferences).

3.5 Safety, Security, and Compliance
- To monitor, detect, and prevent fraud, abuse, and security incidents;
- To enforce our Terms & Conditions and other policies;
- To comply with legal obligations and respond to lawful requests from authorities.

3.6 Service Improvement and Analytics
- To understand how users interact with the Service;
- To diagnose technical problems and improve performance;
- To develop new features and enhancements.

4. How We Share Your Information

4.1 With Other Users
Depending on your settings and usage, some of your information may be visible to others, such as:
- Your public profile and human portfolio;
- Project or community portfolios you create or join;
- Notes or content you choose to share or assign to portfolios;
- Your subscriptions or membership in certain portfolios (e.g., visible to portfolio owners or members).

4.2 With Service Providers and Partners
We share information with third-party service providers who help us operate and improve the Service, including:
- Supabase (for authentication, database, and storage);
- OpenAI (for AI-based analysis, embeddings, and indexing);
- Email delivery and infrastructure providers;
- Analytics and logging providers.

These providers are authorized to use your information only as necessary to provide services to us and are required to protect your information in accordance with applicable laws and contractual obligations.

4.3 With OAuth Providers
If you choose to sign in through an OAuth provider (such as Google or Apple), we share and receive certain information as permitted by that provider’s terms and your settings with them.

4.4 For Legal Reasons
We may disclose your information if we believe in good faith that it is reasonably necessary to:
- Comply with any applicable law, regulation, legal process, or governmental request;
- Enforce our Terms & Conditions, including investigation of potential violations;
- Protect the rights, property, or safety of Ausna, our users, or the public.

5. Cookies and Tracking Technologies
We use cookies and similar technologies to:
- Maintain your session and keep you logged in;
- Remember your preferences;
- Improve the performance and security of the Service.

You may be able to control or disable cookies through your browser settings, but some features of the Service may not function properly without cookies.

6. Data Security
We implement reasonable technical and organizational measures to protect your information from unauthorized access, loss, misuse, or alteration. These measures include access controls, encryption in transit, and secure storage practices.

However, no method of transmission over the internet or method of electronic storage is completely secure. We cannot guarantee absolute security.

7. Data Retention
We retain your information for as long as necessary to provide the Service, comply with our legal obligations, resolve disputes, and enforce our agreements. When your information is no longer needed, we will delete or anonymize it in accordance with our data retention practices and applicable laws.

If you request deletion of your account, we will take reasonable steps to remove or anonymize personal data, subject to retention that may be required for legal, security, or operational reasons.

8. Your Rights and Choices
Depending on your jurisdiction, you may have certain rights with respect to your personal information, including:
- The right to access the personal data we hold about you;
- The right to correct inaccurate or incomplete data;
- The right to request deletion of your personal data, subject to legal limitations;
- The right to object to or restrict certain types of processing;
- The right to data portability, where technically feasible.

You can often access, update, or delete certain information directly through your account settings. To exercise additional rights, please contact us using the contact information below. We may need to verify your identity before responding to your request.

9. Children’s Privacy
The Service is not directed to children under the age of 13, and we do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information. If you believe that a child under 13 has provided us with personal information, please contact us.

10. International Users and Data Transfers
If you access the Service from outside the country where it is primarily operated, your information may be transferred to, stored, and processed in a country that may have data protection laws different from those in your jurisdiction.

Where required by law, we implement appropriate safeguards to protect personal data in connection with such transfers.

11. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. When we make material changes, we will update the \"Last updated\" date at the top of this page and may provide additional notice (such as a Service notification or email).

Your continued use of the Service after the effective date of any changes constitutes your acceptance of the updated Privacy Policy.

12. Contact Us
If you have any questions about this Privacy Policy or wish to exercise your privacy rights, you may contact us at:
[Insert contact email or web form URL]
$privacy$
  ,
  NOW(),
  true
);


