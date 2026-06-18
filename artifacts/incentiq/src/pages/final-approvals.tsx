import Approvals from "./approvals";
import { useIndustryConfig } from "@/hooks/use-industry-config";

export default function FinalApprovals() {
  const indCfg = useIndustryConfig();
  return (
    <Approvals
      title="Executive Approvals"
      description={`${indCfg.eventLabelPlural} requiring final executive sign-off before commission is credited`}
    />
  );
}
