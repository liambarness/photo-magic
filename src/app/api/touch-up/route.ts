import { processImageRequest } from "@/lib/process-image";
export async function POST(request: Request) {
  return processImageRequest(request);
}
