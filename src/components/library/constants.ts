import {
  BookText,
  FileText,
  Headphones,
  Video,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

export const typeIcons: Record<string, typeof FileText> = {
  book: BookText,
  article: FileText,
  podcast: Headphones,
  lecture: Video,
};

export const statusConfig = {
  success: {
    icon: CheckCircle2,
    variant: "default" as const,
    label: "Processed",
    className: "text-green-600 dark:text-green-400",
  },
  processing: {
    icon: Loader2,
    variant: "secondary" as const,
    label: "Processing",
    className: "text-blue-600 dark:text-blue-400 animate-spin",
  },
  pending: {
    icon: Clock,
    variant: "outline" as const,
    label: "Pending",
    className: "text-yellow-600 dark:text-yellow-400",
  },
  failed: {
    icon: AlertCircle,
    variant: "destructive" as const,
    label: "Failed",
    className: "text-red-600 dark:text-red-400",
  },
};
