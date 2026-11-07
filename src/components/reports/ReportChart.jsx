import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ComposedChart, Line,
} from 'recharts';
import { useTr, STATUS_LABELS } from '@/lib/tr';

const C = ['#1e3a5f', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757'];
const axis = { fontSize: 11 };

// Chart for the reports where a visual adds something; returns null otherwise.
export default function ReportChart({ report }) {
  const tr = useTr();
  if (!report?.rows?.length) return null;
  const { name, rows } = report;
  let chart = null;

  if (name === 'payments_by_method') {
    chart = (
      <ComposedChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={axis} /><YAxis yAxisId="l" tick={axis} /><YAxis yAxisId="r" orientation="right" tick={axis} />
        <Tooltip formatter={(v) => Number(v).toLocaleString()} /><Legend />
        <Bar yAxisId="l" stackId="m" dataKey="cheque" name={tr('Cheque', 'شيك')} fill={C[0]} />
        <Bar yAxisId="l" stackId="m" dataKey="bank_transfer" name={tr('Bank transfer', 'تحويل بنكي')} fill={C[1]} />
        <Bar yAxisId="l" stackId="m" dataKey="bank_deposit" name={tr('Bank deposit', 'إيداع بنكي')} fill={C[2]} />
        <Bar yAxisId="l" stackId="m" dataKey="payment_gateway" name={tr('Payment gateway', 'بوابة الدفع')} fill={C[3]} />
        <Line yAxisId="r" type="monotone" dataKey="cumulative" name={tr('Cumulative', 'تراكمي')} stroke={C[5]} strokeWidth={2} />
      </ComposedChart>
    );
  } else if (name === 'applications' || name === 'pending_contributions') {
    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const data = Object.entries(counts).map(([s, n]) => ({ status: STATUS_LABELS[s] ? tr(...STATUS_LABELS[s]) : s, n }));
    chart = (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="status" tick={axis} /><YAxis allowDecimals={false} tick={axis} /><Tooltip />
        <Bar dataKey="n" name={tr('Applications', 'الطلبات')} fill={C[1]} />
      </BarChart>
    );
  } else if (name === 'officer_workload') {
    chart = (
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="officer" tick={axis} /><YAxis allowDecimals={false} tick={axis} /><Tooltip /><Legend />
        <Bar dataKey="assigned" stackId="w" name={tr('Assigned', 'مسند')} fill={C[1]} />
        <Bar dataKey="under_review" stackId="w" name={tr('Under review', 'قيد المراجعة')} fill={C[3]} />
        <Bar dataKey="pending_manager_approval" stackId="w" name={tr('Pending approval', 'بانتظار الاعتماد')} fill={C[4]} />
        <Bar dataKey="completed" stackId="w" name={tr('Completed', 'مكتمل')} fill={C[2]} />
      </BarChart>
    );
  } else if (name === 'dues_aging') {
    const buckets = ['0-30', '31-90', '91-180', '180+'].map((b) => ({ bucket: b, remaining: rows.filter((r) => r.bucket === b).reduce((s, r) => s + Number(r.remaining || 0), 0) }));
    chart = (
      <BarChart data={buckets}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bucket" tick={axis} /><YAxis tick={axis} /><Tooltip formatter={(v) => `${Number(v).toLocaleString()} KWD`} />
        <Bar dataKey="remaining" name={tr('Outstanding (KWD)', 'المستحق (د.ك)')} fill={C[5]} />
      </BarChart>
    );
  } else if (name === 'contributions') {
    const byYear = {};
    rows.forEach((r) => {
      byYear[r.financial_year] = byYear[r.financial_year] || { year: r.financial_year, due: 0, paid: 0 };
      byYear[r.financial_year].due += Number(r.due || 0);
      byYear[r.financial_year].paid += Number(r.paid || 0);
    });
    chart = (
      <BarChart data={Object.values(byYear).sort((a, b) => String(a.year).localeCompare(String(b.year)))}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={axis} /><YAxis tick={axis} /><Tooltip formatter={(v) => `${Number(v).toLocaleString()} KWD`} /><Legend />
        <Bar dataKey="due" name={tr('Due', 'المستحق')} fill={C[0]} />
        <Bar dataKey="paid" name={tr('Paid', 'المدفوع')} fill={C[2]} />
      </BarChart>
    );
  }
  if (!chart) return null;
  return (
    <div className="h-72 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="report-chart" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
    </div>
  );
}
