const KnowledgeBaseLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <div className="h-full flex dark:bg-[#1F1F1F]">
      {children}
    </div>
  );
};

export default KnowledgeBaseLayout; 