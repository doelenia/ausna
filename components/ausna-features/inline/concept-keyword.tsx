import { createReactInlineContentSpec } from "@blocknote/react";
 
// The Mention inline content.
export const ConceptKeyword = createReactInlineContentSpec(
  {
    type: "conceptKeyword",
    propSchema: {
      alias: {
        default: "Name of the concept",
      },
      id: {
        default: "-1",
      },
    },
    content: "none",
  },
  {
    render: (props) => (
      <span className="bg-transparent hover:bg-primary/5">
        {props.inlineContent.props.alias}
      </span>
    ),
  }
);
 