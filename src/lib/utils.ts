import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { pb } from "./pocketbase";
import { toast } from "sonner";
import {  type UsersResponse } from "./pocketbase-types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function handleError(error: Error) {
  if (error instanceof Error && error.message.includes("The request was autocancelled")) {
    return;
  }
  console.error(error)
  toast.error("An error occurred", {
    description: error.message,
    richColors: true
  })
}

export function getUserRecord(): UsersResponse {
  pb.collection("users").authRefresh();
  return pb.authStore.record as UsersResponse;
}