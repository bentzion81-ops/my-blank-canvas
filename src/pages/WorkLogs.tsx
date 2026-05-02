import { AppHeader } from "@/components/layout/AppHeader";
import { WorkLogsTable } from "@/components/work-logs/WorkLogsTable";

const WorkLogs = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Work Logs" subtitle="Unified attendance from all sources" />
      <div className="flex-1 p-4 lg:p-6">
        <WorkLogsTable scope="global" />
      </div>
    </div>
  );
};

export default WorkLogs;
