import { create } from "zustand";

interface RightSidebarStore {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

export const useRightSidebar = create<RightSidebarStore>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
})); 