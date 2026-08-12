import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import { normalizeStateCode } from "@/lib/jurisdiction";
import { isAiProvider, parseAiProvider, type PreferredAiProvider } from "@/lib/ai/providers";
import { isXaiProviderOffered } from "@/lib/zdr";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/** Count the digits in a phone string (ignores spaces, dashes, parens, +). */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

async function resolve() {
  if (BYPASS_AUTH) {
    return { userId: BYPASS_USER_ID, db: createServiceClient() };
  }
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { userId: user.id, db };
}

/** Current profile (name, phone, email) for the signed-in user. */
export async function GET(_req: NextRequest) {
  const ctx = await resolve();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await ctx.db
    .from("profiles")
    .select("full_name, phone, email, is_attorney, account_type, attorney_user_status, bar_number, firm_name, home_state, preferred_ai_provider")
    .eq("id", ctx.userId)
    .maybeSingle();

  return NextResponse.json({
    full_name: data?.full_name ?? "",
    phone: data?.phone ?? "",
    email: data?.email ?? "",
    is_attorney: !!data?.is_attorney,
    account_type: data?.account_type ?? "client",
    attorney_user_status: data?.attorney_user_status ?? null,
    bar_number: data?.bar_number ?? "",
    firm_name: data?.firm_name ?? "",
    home_state: data?.home_state ?? "",
    preferred_ai_provider: parseAiProvider(data?.preferred_ai_provider),
    xai_provider_offered: isXaiProviderOffered(),
  });
}

/**
 * Update the signed-in user's name and/or phone. Used by the account page edit
 * form and the onboarding contact-info step. Only the fields present in the body
 * are touched.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolve();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    full_name?: unknown;
    phone?: unknown;
    bar_number?: unknown;
    firm_name?: unknown;
    home_state?: unknown;
    preferred_ai_provider?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: {
    full_name?: string;
    phone?: string;
    bar_number?: string;
    firm_name?: string;
    home_state?: string;
    preferred_ai_provider?: PreferredAiProvider;
  } = {};

  if (typeof body.full_name === "string") {
    const name = body.full_name.trim();
    if (!name) {
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: "That name is too long." }, { status: 400 });
    }
    update.full_name = name;
  }

  if (typeof body.phone === "string") {
    const phone = body.phone.trim();
    if (phone) {
      const digits = digitCount(phone);
      if (digits < 10 || digits > 15) {
        return NextResponse.json(
          { error: "Please enter a valid phone number (10–15 digits)." },
          { status: 400 }
        );
      }
      if (phone.length > 32) {
        return NextResponse.json({ error: "That phone number is too long." }, { status: 400 });
      }
    }
    // Empty string clears the phone; non-empty stores as entered.
    update.phone = phone;
  }

  if (typeof body.bar_number === "string") {
    const barNumber = body.bar_number.trim();
    if (barNumber.length > 40) {
      return NextResponse.json({ error: "That bar number is too long." }, { status: 400 });
    }
    update.bar_number = barNumber;
  }

  if (typeof body.firm_name === "string") {
    const firmName = body.firm_name.trim();
    if (firmName.length > 200) {
      return NextResponse.json({ error: "That firm name is too long." }, { status: 400 });
    }
    update.firm_name = firmName;
  }

  if (typeof body.home_state === "string") {
    const normalized = normalizeStateCode(body.home_state);
    if (!normalized) {
      return NextResponse.json({ error: "Please select a valid state." }, { status: 400 });
    }
    update.home_state = normalized;
  }

  if (body.preferred_ai_provider !== undefined) {
    if (!isAiProvider(body.preferred_ai_provider)) {
      return NextResponse.json(
        { error: "Preferred AI provider must be anthropic or xai." },
        { status: 400 }
      );
    }
    if (body.preferred_ai_provider === "xai" && !isXaiProviderOffered()) {
      return NextResponse.json(
        {
          error:
            "Grok is not available yet. Add XAI_API_KEY and confirm xAI ZDR before enabling this preference in production.",
        },
        { status: 400 }
      );
    }
    update.preferred_ai_provider = body.preferred_ai_provider;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await ctx.db.from("profiles").update(update).eq("id", ctx.userId);
  if (error) {
    return NextResponse.json({ error: "Couldn't save your changes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...update });
}
