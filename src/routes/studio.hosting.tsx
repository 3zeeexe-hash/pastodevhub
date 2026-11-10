import { createFileRoute } from "@tanstack/react-router";
import { HostingManager } from "@/components/hosting-manager";

export const Route = createFileRoute("/studio/hosting")({ component: () => <HostingManager kind="html" /> });
