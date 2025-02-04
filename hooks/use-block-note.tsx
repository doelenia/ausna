import { create } from "zustand";

type BlockNoteStore = {
	document: string;
	onCreate: (update: string) => void;
	onChange: (update: string) => void;
	onDelete: (update: string) => void;
};

export const useBlockNote= create<BlockNoteStore>((set) => ({
	document: "",
	onCreate: (update: string) => {
		set({ document: update });
	},
	onChange: (update: string) => {
		set({ document: update });
	},
	onDelete: (update: string) => {
		set({ document: update });
	},
}));