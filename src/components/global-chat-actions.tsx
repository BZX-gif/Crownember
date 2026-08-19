"use client";

import { useEffect, useRef, useState } from "react";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "😡", "👍", "💀"];
const DOUBLE_TAP_MS = 320;

interface ActionState {
  top: number;
  left: number;
  id: number;
  username: string;
  content: string;
  mine: boolean;
}
interface ReactionState { counts: Record<string, number>; selected: string | null }

function getReactKey(el: HTMLElement): string | null {
  const key = Object.keys(el).find((k) => k