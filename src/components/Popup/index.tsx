import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Edit, Save, Trash2 } from "lucide-react";
import type { PopupProps, PopupSettings } from "~/types";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import ThemeToggle from "../ThemeToggle";

export default function PopupComponent({
  initialSettings = {},
  onSave,
  className = "w-96 p-4 bg-background",
}: PopupProps) {
  const [geminiApiKey, setGeminiApiKey] = useState(
    initialSettings.geminiApiKey || ""
  );
  const [cohereApiKey, setCohereApiKey] = useState(
    initialSettings.cohereApiKey || ""
  );
  const [preferences, setPreferences] = useState(
    initialSettings.preferences || ""
  );
  const [originalGeminiApiKey, setOriginalGeminiApiKey] = useState(
    initialSettings.geminiApiKey || ""
  );
  const [originalCohereApiKey, setOriginalCohereApiKey] = useState(
    initialSettings.cohereApiKey || ""
  );
  const [originalPreferences, setOriginalPreferences] = useState(
    initialSettings.preferences || ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const initialLoadDone = useRef(false);

  const hasChanges =
    geminiApiKey !== originalGeminiApiKey ||
    cohereApiKey !== originalCohereApiKey ||
    preferences !== originalPreferences;

  const saveSettings = () => {
    const settings: PopupSettings = {
      geminiApiKey,
      cohereApiKey,
      preferences,
    };

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set(
        {
          geminiApiKey,
          cohereApiKey,
          preferences,
          enableKeywords: true, // always extract keywords
        },
        () => {
          console.log("Settings saved successfully");

          setOriginalGeminiApiKey(geminiApiKey);
          setOriginalCohereApiKey(cohereApiKey);
          setOriginalPreferences(preferences);
          setIsEditing(false);
        }
      );
    } else {
      // fallback
      setOriginalGeminiApiKey(geminiApiKey);
      setOriginalCohereApiKey(cohereApiKey);
      setOriginalPreferences(preferences);
      setIsEditing(false);
      onSave?.(settings);
    }
  };

  // Use a ref for the reset button
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Direct DOM manipulation for the reset button to avoid React's synthetic events
    const resetButton = resetButtonRef.current;
    if (resetButton) {
      const handleReset = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (typeof chrome !== "undefined" && chrome.runtime) {
          if (
            window.confirm(
              "Are you sure you want to reset all browsing data? This action cannot be undone."
            )
          ) {
            console.log("Sending reset command to background script...");

            // Send message to background script to handle the reset
            chrome.runtime.sendMessage(
              { action: "resetBrowsingData" },
              (response) => {
                if (response && response.success) {
                  console.log("Reset completed successfully");
                  window.alert("Browsing data has been reset successfully!");
                } else {
                  console.error(
                    "Reset failed:",
                    response?.error || "unknown error"
                  );
                  window.alert(
                    "Failed to reset browsing data. Please try again."
                  );
                }
              }
            );
          }
        }
        return false;
      };

      // Remove old listeners if any
      resetButton.removeEventListener("click", handleReset as EventListener);
      // Add new listener
      resetButton.addEventListener("click", handleReset as EventListener);

      // Cleanup on unmount
      return () => {
        resetButton.removeEventListener("click", handleReset as EventListener);
      };
    }
  }, []); // Empty dependency array as we only want to set up the listener once

  const cancelEdit = () => {
    setGeminiApiKey(originalGeminiApiKey);
    setCohereApiKey(originalCohereApiKey);
    setPreferences(originalPreferences);
    setIsEditing(false);
  };

  useEffect(() => {
    // only load on first render
    if (initialLoadDone.current) return;

    if (
      Object.keys(initialSettings).length === 0 &&
      typeof chrome !== "undefined" &&
      chrome.storage
    ) {
      chrome.storage.local.get(
        ["geminiApiKey", "cohereApiKey", "preferences"],
        (result) => {
          console.log("Loading settings:", result);
          initialLoadDone.current = true;

          if (result.geminiApiKey !== undefined) {
            setGeminiApiKey(result.geminiApiKey);
            setOriginalGeminiApiKey(result.geminiApiKey);
          }
          if (result.cohereApiKey !== undefined) {
            setCohereApiKey(result.cohereApiKey);
            setOriginalCohereApiKey(result.cohereApiKey);
          }
          if (result.preferences !== undefined) {
            setPreferences(result.preferences);
            setOriginalPreferences(result.preferences);
          }

          setIsInitialized(true);
        }
      );
    } else {
      initialLoadDone.current = true;
      setIsInitialized(true);
    }
  }, [initialSettings]);

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">ReCall</h1>
        <ThemeToggle />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configure API keys and content preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="geminiApiKey">Gemini API Key</Label>
            <Input
              id="geminiApiKey"
              type="password"
              placeholder="Enter your Gemini API key"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              disabled={!isEditing}
              className={!isEditing ? "opacity-60" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cohereApiKey">Cohere API Key</Label>
            <Input
              id="cohereApiKey"
              type="password"
              placeholder="Enter your Cohere API key for semantic search"
              value={cohereApiKey}
              onChange={(e) => setCohereApiKey(e.target.value)}
              disabled={!isEditing}
              className={!isEditing ? "opacity-60" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferences">User Rules</Label>
            <Textarea
              id="preferences"
              placeholder="Enter your preferences for what content should be saved. These preferences get sent to the AI."
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              disabled={!isEditing}
              className={`h-32 ${!isEditing ? "opacity-60" : ""}`}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {!isEditing ? (
            <>
              <Button onClick={() => setIsEditing(true)} className="w-full">
                <Edit className="mr-2 h-4 w-4" />
                Edit Settings
              </Button>

              <button
                ref={resetButtonRef}
                className="w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
                type="button"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Reset Browsing Data
              </button>
            </>
          ) : (
            <div className="flex w-full gap-2">
              <Button
                onClick={saveSettings}
                className="flex-1"
                disabled={!hasChanges}
              >
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button onClick={cancelEdit} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
