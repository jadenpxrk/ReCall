import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Edit, Save } from "lucide-react";
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
  const [apiKey, setApiKey] = useState(initialSettings.apiKey || "");
  const [preferences, setPreferences] = useState(
    initialSettings.preferences || ""
  );
  const [originalApiKey, setOriginalApiKey] = useState(
    initialSettings.apiKey || ""
  );
  const [originalPreferences, setOriginalPreferences] = useState(
    initialSettings.preferences || ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const initialLoadDone = useRef(false);

  const hasChanges =
    apiKey !== originalApiKey || preferences !== originalPreferences;

  const saveSettings = () => {
    const settings: PopupSettings = {
      apiKey,
      preferences,
    };

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set(
        {
          ...settings,
          enableKeywords: true, // always extract keywords
        },
        () => {
          console.log("Settings saved successfully");

          setOriginalApiKey(apiKey);
          setOriginalPreferences(preferences);
          setIsEditing(false);
        }
      );
    } else {
      // fallback
      setOriginalApiKey(apiKey);
      setOriginalPreferences(preferences);
      setIsEditing(false);
      onSave?.(settings);
    }
  };

  const cancelEdit = () => {
    setApiKey(originalApiKey);
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
      chrome.storage.local.get(["apiKey", "preferences"], (result) => {
        console.log("Loading settings:", result);
        initialLoadDone.current = true;

        if (result.apiKey !== undefined) {
          setApiKey(result.apiKey);
          setOriginalApiKey(result.apiKey);
        }
        if (result.preferences !== undefined) {
          setPreferences(result.preferences);
          setOriginalPreferences(result.preferences);
        }

        setIsInitialized(true);
      });
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
            Configure API key and content preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
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
              className={`h-32 ${!isEditing ? "opacity-60" : ""}`}
              disabled={!isEditing}
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="w-full">
              <Edit className="mr-2 h-4 w-4" />
              Edit Settings
            </Button>
          ) : (
            <>
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
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
