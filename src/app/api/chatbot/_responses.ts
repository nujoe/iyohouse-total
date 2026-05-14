import { NextResponse } from "next/server";
import { ChatbotServiceError } from "@/features/iyohouse-chatbot/server/chatbot-service";

export function chatbotJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function chatbotRouteError(error: unknown) {
  const status = error instanceof ChatbotServiceError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unknown chatbot error";

  return chatbotJson({ error: message }, status);
}
