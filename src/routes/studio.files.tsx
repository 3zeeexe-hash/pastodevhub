import { createFileRoute } from "@tanstack/react-router";
import { HostingManager } from "@/components/hosting-manager";

export const Route = createFileRoute("/studio/files")({ component: () => <HostingManager kind="file" /> });
