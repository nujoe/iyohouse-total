import { getChatbotHealth } from "@/features/iyohouse-chatbot/server/chatbot-service";
import { chatbotJson, chatbotRouteError } from "../_responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getChatbotHealth();
    return chatbotJson(health);
  } catch (error) {
    return chatbotRouteError(error);
  }
}
