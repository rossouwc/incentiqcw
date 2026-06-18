import { useGetTenant } from "@workspace/api-client-react";
import { getIndustryConfig, IndustryConfig } from "@/lib/industry-config";

export function useIndustryConfig(): IndustryConfig {
  const { data: tenant } = useGetTenant();
  const industryCode = (tenant as any)?.industry ?? "IT_CONSULTING";
  return getIndustryConfig(industryCode);
}
