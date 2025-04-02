"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";

interface ConceptSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  buttonLabel?: string;
}

export const ConceptSelector = ({
  value,
  onChange,
  buttonLabel = "Select concept..."
}: ConceptSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Id<"concepts">[]>([]);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const searchConcepts = useAction(api.vectorEmbed.searchSimilarConcepts);
  
  const selectedConcept = useQuery(
    api.concepts.getById,
    value ? { conceptId: value as any } : "skip"
  );

  const conceptsData = useQuery(
    api.concepts.getConceptsByIds,
    searchResults.length > 0 ? { conceptIds: searchResults } : "skip"
  );

  const debouncedSearch = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        console.log("Searching for:", value);
        const results = await searchConcepts({
          name: value,
          description: value,
          limit: 10,
        });
        console.log("Search results received:", results);
        setSearchResults(results);
      } catch (error) {
        console.error("Search failed:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [searchConcepts]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim()) {
        console.log("Initiating search for:", search);
        debouncedSearch(search);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  useEffect(() => {
    if (searchResults.length > 0) {
      console.log("Fetching concept details for:", searchResults);
    }
  }, [searchResults]);

  useEffect(() => {
    if (conceptsData) {
      console.log("Concept details received:", conceptsData);
    }
  }, [conceptsData]);

  useEffect(() => {
    if (open && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - buttonRect.bottom;
      // Leave some padding at the bottom (e.g., 20px)
      setMaxHeight(spaceBelow - 20);
    }
  }, [open]);

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        role="combobox"
        className="w-full justify-between"
        onClick={() => setOpen(!open)}
      >
        {value
          ? selectedConcept?.aliasList[0] || "Unnamed Concept"
          : buttonLabel}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-50 top-full w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md outline-none">
          <Command className="w-full">
            <CommandInput
              placeholder="Search concepts..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList 
              className="overflow-y-auto"
              style={{ maxHeight: maxHeight ? `${maxHeight}px` : '300px' }}
            >
              {isSearching ? (
                <div className="py-6 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Searching...
                  </p>
                </div>
              ) : (
                <>
                  {(!conceptsData || conceptsData.length === 0) ? (
                    <CommandEmpty>No concepts found.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {conceptsData.map((concept) => (
                        <CommandItem
                          key={concept._id}
                          value={search}
                          onSelect={() => {
                            onChange(concept._id === value ? undefined : concept._id);
                            setOpen(false);
                          }}
                          className="px-4 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground data-[selected]:bg-accent data-[selected]:text-accent-foreground"
                        >
                          <div className="flex flex-col w-full gap-1">
                            <div className="flex items-center">
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 flex-shrink-0",
                                  value === concept._id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <span className="font-medium">
                                {concept.aliasList[0] || "Unnamed Concept"}
                              </span>
                            </div>
                            {concept.description && (
                              <p className="text-sm text-muted-foreground ml-6 line-clamp-2">
                                {concept.description}
                              </p>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}; 