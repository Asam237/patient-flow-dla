"use client";

import { useMemo } from "react";
import type { QueueNumber, User } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Clock,
  CheckCircle,
  TrendingUp,
  History,
  Hash,
  LayoutDashboard,
} from "lucide-react";

interface AnalyticsPanelProps {
  queueNumbers: QueueNumber[];
  assistants: User[];
}

const formatDuration = (start: any | null, end: any | null) => {
  if (!start || !end) return "—";
  const diffInMs = end.getTime() - start.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);

  if (diffInSeconds < 0) return "0s";

  const minutes = Math.floor(diffInSeconds / 60);
  const seconds = diffInSeconds % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

export function AnalyticsPanel({
  queueNumbers,
  assistants,
}: AnalyticsPanelProps) {
  const stats = useMemo(() => {
    const completed = queueNumbers.filter((n) => n.status === "completed");
    const waiting = queueNumbers.filter((n) => n.status === "waiting");
    const current = queueNumbers.filter((n) => n.status === "current");

    const withWait = completed.filter((n) => n.calledAt && n.createdAt);
    const avgWaitMin =
      withWait.length > 0
        ? withWait.reduce((sum, n) => {
            return (
              sum + (n.calledAt!.getTime() - n.createdAt.getTime()) / 1000 / 60
            );
          }, 0) / withWait.length
        : 0;

    const total = queueNumbers.length;
    const completionRate =
      total > 0 ? Math.round((completed.length / total) * 100) : 0;

    const byAssistant = assistants.map((assistant) => {
      const handled = completed.filter((n) => n.assistantId === assistant.id);
      return { assistant, count: handled.length };
    });

    const maxCount = Math.max(...byAssistant.map((a) => a.count), 1);

    const completedTickets = [...completed].sort((a, b) => {
      const ta = a.completedAt?.getTime() ?? 0;
      const tb = b.completedAt?.getTime() ?? 0;
      return tb - ta;
    });

    return {
      total,
      completedCount: completed.length,
      waitingCount: waiting.length,
      currentCount: current.length,
      completionRate,
      avgWaitMin,
      byAssistant,
      maxCount,
      completedTickets,
    };
  }, [queueNumbers, assistants]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="Tickets Processed"
          value={stats.completedCount.toString()}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <MetricCard
          icon={<Clock className="w-5 h-5" />}
          label="In Waiting"
          value={stats.waitingCount.toString()}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <MetricCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Avg. Wait Time"
          value={
            stats.avgWaitMin > 0 ? `${stats.avgWaitMin.toFixed(0)} min` : "—"
          }
          color="text-indigo-600"
          bgColor="bg-indigo-50"
        />
        <MetricCard
          icon={<Users className="w-5 h-5" />}
          label="Efficiency"
          value={`${stats.completionRate}%`}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Performance by Assistant */}
        <Card className="lg:col-span-1 border-none shadow-sm ring-1 ring-slate-200/60 rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              Volume by Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {stats.byAssistant.filter((a) => a.count > 0).length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-400">No tickets processed</p>
                </div>
              ) : (
                stats.byAssistant
                  .sort((a, b) => b.count - a.count)
                  .map(({ assistant, count }) => (
                    <div key={assistant.id} className="group">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: assistant.color }}
                          >
                            {assistant.name.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-slate-600">
                            {assistant.name}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-slate-900">
                          {count}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${(count / stats.maxCount) * 100}%`,
                            backgroundColor: assistant.color,
                          }}
                        />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tickets History */}
        <Card className="lg:col-span-2 border-none shadow-sm ring-1 ring-slate-200/60 rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              Latest Completed Tickets
            </CardTitle>
            <span className="px-2.5 py-0.5 bg-white border border-slate-200 rounded-full text-[10px] font-medium text-slate-500 shadow-sm">
              {stats.completedTickets.length} total
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {stats.completedTickets.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-sm text-slate-400">
                  Waiting for completion...
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/30">
                      <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider px-6 py-4">
                        Ticket
                      </th>
                      <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider px-6 py-4">
                        Handled By
                      </th>
                      <th className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider px-6 py-4">
                        Processing Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.completedTickets.map((ticket) => {
                      const assistant = assistants.find(
                        (a) => a.id === ticket.assistantId,
                      );
                      return (
                        <tr
                          key={ticket.id}
                          className="hover:bg-slate-50/80 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                                <Hash className="w-3.5 h-3.5 text-indigo-500" />
                              </div>
                              <span className="font-bold text-slate-900 text-base">
                                {ticket.number}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {assistant ? (
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: assistant.color }}
                                />
                                <span className="text-sm text-slate-600 font-medium">
                                  {assistant.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">
                                Auto-validated
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                              {formatDuration(
                                ticket.calledAt,
                                ticket.completedAt,
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div
        className={`w-10 h-10 ${bgColor} ${color} rounded-2xl flex items-center justify-center mb-4`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-tight mb-1">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">
            {value}
          </h3>
        </div>
      </div>
    </div>
  );
}
