"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import {
	BlockNoteEditor,
	PartialBlock,
} from "@blocknote/core";

import {
	useCreateBlockNote
} from "@blocknote/react";

import { BlockNoteView } from "@blocknote/mantine";

import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import { useTheme } from "next-themes";

import { useEdgeStore } from "@/lib/edgestore";

interface EditorProps {
	onChange: (value: string) => void;
	initialContent?: string;
	editable?: boolean;
}

const Editor = ({
	onChange,
	initialContent,
	editable
}: EditorProps) => {
	const { edgestore } = useEdgeStore();
	const { resolvedTheme } = useTheme();

	const handleUpload = async (file: File) => {
		const res = await edgestore.publicFiles.upload({
			file,
		});

		return res.url;
	}


	const editor: BlockNoteEditor = useCreateBlockNote({
		initialContent:
			initialContent
			? JSON.parse(initialContent) as PartialBlock[]
			: undefined,
		animations: false,
		uploadFile: handleUpload,
	});


	return (
		<div>
			<BlockNoteView
				editor={editor}
				editable={editable}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				onChange={() => onChange(JSON.stringify(editor.document, null, 2))}
			/>
		</div>
	)
}

export default Editor;