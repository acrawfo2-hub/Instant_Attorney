import type { ConsultRequest } from "./types";

export type ConsultAction = {
  label: string;
  href: string;
};

/** The always-available client entry point for attorney scheduling. */
export function getConsultAction(
  consultRequest: ConsultRequest | null | undefined,
  hasConsultSub: boolean,
): ConsultAction {
  if (consultRequest?.status === "confirmed") {
    return {
      label: "View confirmed appointment",
      href: `/consult/${consultRequest.id}/session`,
    };
  }

  if (consultRequest?.status === "attorney_proposed") {
    return { label: "Respond to proposed time", href: "/dashboard#consult-status" };
  }

  if (consultRequest?.status === "pending") {
    return { label: "Manage appointment", href: "/dashboard#consult-status" };
  }

  return {
    label: "Schedule attorney time",
    href: hasConsultSub ? "/consult/schedule" : "/register?upgrade=consult",
  };
}
