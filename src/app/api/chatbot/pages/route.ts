import { listChatbotPages } from "@/features/iyohouse-chatbot/server/chatbot-service";
import { chatbotJson, chatbotRouteError } from "../_responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const pages = await listChatbotPages();
    return chatbotJson(pages);
  } catch (error) {
    return chatbotRouteError(error);
  }
}
