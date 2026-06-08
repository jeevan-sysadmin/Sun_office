import React, { useEffect, useMemo, useState } from "react";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";
import type { DashboardStats, ServiceOrder } from "./types";
import "./css/OverallReportTab.css";
import { WATER_SERVICES_URL } from "../config/api";

interface OverallReportTabProps {
  services: ServiceOrder[];
  dashboardStats: DashboardStats;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  loading?: boolean;
}

interface StaffSummaryApiItem {
  service_staff_name?: string;
  service_count?: number | string;
  total_amount?: number | string;
}

interface StaffPaymentApiItem {
  service_staff_name?: string;
  service_date?: string;
  amount?: number | string;
}

const toAmount = (value: unknown): number => {
  const cleaned = String(value ?? "0").replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const getServiceAmount = (s: ServiceOrder): number => {
  return (
    toAmount((s as any).amount) ||
    toAmount((s as any).service_amount) ||
    toAmount((s as any).total_amount) ||
    toAmount(s.final_cost) ||
    toAmount(s.estimated_cost) ||
    0
  );
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

const OverallReportTab: React.FC<OverallReportTabProps> = ({
  services,
  dashboardStats,
  selectedMonth,
  onMonthChange,
  loading = false,
}) => {
  const [staffMonthlySummary, setStaffMonthlySummary] = useState<StaffSummaryApiItem[]>([]);
  const [staffMonthlyPayments, setStaffMonthlyPayments] = useState<StaffPaymentApiItem[]>([]);

  useEffect(() => {
    const fetchStaffMonthlySummary = async () => {
      try {
        const response = await fetch(
          `${WATER_SERVICES_URL}?action=staff_monthly_summary&month=${selectedMonth}`
        );
        const result = await response.json();
        if (response.ok && result.success) {
          setStaffMonthlySummary(Array.isArray(result.summary) ? result.summary : []);
          setStaffMonthlyPayments(Array.isArray(result.payments) ? result.payments : []);
        } else {
          setStaffMonthlySummary([]);
          setStaffMonthlyPayments([]);
        }
      } catch (_err) {
        setStaffMonthlySummary([]);
        setStaffMonthlyPayments([]);
      }
    };

    fetchStaffMonthlySummary();
  }, [selectedMonth]);

  const report = useMemo(() => {
    const [yy, mm] = selectedMonth.split("-").map((x) => parseInt(x, 10));

    const monthServices = services.filter((s) => {
      if (!s.created_at) return false;
      const dt = new Date(s.created_at);
      return dt.getFullYear() === yy && dt.getMonth() + 1 === mm;
    });

    const staffMap = new Map<string, { staffName: string; numCalls: number; totalAmount: number }>();
    const dailyMap = new Map<string, { serviceDate: string; staffName: string; numCalls: number; totalAmount: number }>();

    monthServices
      .filter((s) => {
        const st = (s.status || "").toLowerCase();
        return st === "completed" || st === "delivered" || st === "active";
      })
      .forEach((s) => {
        const staffName = (
          s.staff_name ||
          s.service_staff_name ||
          s.assigned_staff ||
          s.technician ||
          (s.staff && s.staff.name) ||
          "Unassigned"
        ).trim() || "Unassigned";
        const amount = getServiceAmount(s);
        const dt = new Date(s.created_at);
        const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
          dt.getDate()
        ).padStart(2, "0")}`;

        const existingStaff = staffMap.get(staffName) || {
          staffName,
          numCalls: 0,
          totalAmount: 0,
        };
        existingStaff.numCalls += 1;
        existingStaff.totalAmount += amount;
        staffMap.set(staffName, existingStaff);

        const dailyKey = `${staffName}__${dateKey}`;
        const existingDay = dailyMap.get(dailyKey) || {
          serviceDate: dateKey,
          staffName,
          numCalls: 0,
          totalAmount: 0,
        };
        existingDay.numCalls += 1;
        existingDay.totalAmount += amount;
        dailyMap.set(dailyKey, existingDay);
      });

    let staffSummary = Array.from(staffMap.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount
    );
    let staffDaily = Array.from(dailyMap.values()).sort((a, b) =>
      a.serviceDate > b.serviceDate ? 1 : -1
    );

    if (staffMonthlySummary.length > 0) {
      staffSummary = staffMonthlySummary.map((row) => ({
        staffName: (row.service_staff_name || "Unassigned").trim() || "Unassigned",
        numCalls: parseInt(String(row.service_count || "0"), 10) || 0,
        totalAmount: toAmount(row.total_amount),
      }));
    }

    if (staffMonthlyPayments.length > 0) {
      const apiDailyMap = new Map<string, { serviceDate: string; staffName: string; numCalls: number; totalAmount: number }>();
      staffMonthlyPayments.forEach((p) => {
        const staffName = (p.service_staff_name || "Unassigned").trim() || "Unassigned";
        const serviceDate = (p.service_date || "").slice(0, 10);
        const key = `${staffName}__${serviceDate}`;
        const existing = apiDailyMap.get(key) || { serviceDate, staffName, numCalls: 0, totalAmount: 0 };
        existing.numCalls += 1;
        existing.totalAmount += toAmount(p.amount);
        apiDailyMap.set(key, existing);
      });
      staffDaily = Array.from(apiDailyMap.values()).sort((a, b) =>
        a.serviceDate > b.serviceDate ? 1 : -1
      );
    }

    const totalCalls = staffSummary.reduce((sum, row) => sum + row.numCalls, 0);
    const totalAmount = staffSummary.reduce((sum, row) => sum + row.totalAmount, 0);

    return { monthServices, staffSummary, staffDaily, totalCalls, totalAmount };
  }, [services, selectedMonth, staffMonthlySummary, staffMonthlyPayments]);

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map((x) => parseInt(x, 10));
    return new Date(y, (m || 1) - 1, 1).toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }, [selectedMonth]);

  const handlePrint = () => window.print();
  const handleExport = () => {
    const rows = [
      "Staff Name,Service Date,No Of Calls,Total Service Call Amount",
      ...report.staffDaily.map(
        (r) => `${r.staffName},${r.serviceDate},${r.numCalls},${r.totalAmount.toFixed(2)}`
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `overall-report-${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overall-report-page">
      <div className="overall-report-toolbar">
        <div className="overall-report-title-wrap">
          <h2>Overall Report</h2>
          <p>Income, expense, and staff performance report template</p>
        </div>
        <div className="overall-report-actions">
          <label className="month-input-wrap">
            <span>Month</span>
            <input type="month" value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)} />
          </label>
          <button type="button" className="report-btn secondary" onClick={handlePrint}>
            <FiPrinter /> Print
          </button>
          <button type="button" className="report-btn secondary" onClick={handleExport}>
            <FiDownload /> Export CSV
          </button>
          <button type="button" className="report-btn primary" onClick={() => onMonthChange(selectedMonth)}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      <div className="overall-report-sheet printable-report-sheet">
        <div className="sheet-header">
          <h3>INCOME EXPENSE REPORT</h3>
          <p>{monthLabel}</p>
        </div>

        <div className="receipt-payment-grid">
          <div className="ledger-card receipt">
            <div className="ledger-head">
              <span>Receipt</span>
            </div>
            <div className="ledger-row total">
              <span>Service Call Charges</span>
              <strong>{fmt(dashboardStats.monthly_revenue)}</strong>
            </div>
          </div>
          <div className="ledger-card payment">
            <div className="ledger-head">
              <span>Payment</span>
            </div>
            <div className="ledger-row">
              <span>Staff Salary</span>
              <strong>{fmt(dashboardStats.monthly_salary)}</strong>
            </div>
            <div className="ledger-row">
              <span>Other Expenses</span>
              <strong>{fmt(dashboardStats.monthly_expenses)}</strong>
            </div>
            <div className="ledger-row total">
              <span>Total Payment</span>
              <strong>{fmt(dashboardStats.monthly_salary + dashboardStats.monthly_expenses)}</strong>
            </div>
          </div>
        </div>

        <div className="kpi-strip">
          <div className="kpi-box"><span>Calls</span><strong>{report.totalCalls}</strong></div>
          <div className="kpi-box"><span>Collected</span><strong>{fmt(report.totalAmount)}</strong></div>
          <div className="kpi-box"><span>Profit</span><strong>{fmt(dashboardStats.monthly_profit)}</strong></div>
        </div>

        <div className="report-table-wrap">
          <h4>Staff Summary</h4>
          <table className="report-table">
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Num Of Calls</th>
                <th>Total Service Call Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.staffSummary.map((r, idx) => (
                <tr key={`${r.staffName}-${idx}`}>
                  <td>{r.staffName}</td>
                  <td>{r.numCalls}</td>
                  <td>{fmt(r.totalAmount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>TOTAL</td>
                <td>{report.totalCalls}</td>
                <td>{fmt(report.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="report-table-wrap">
          <h4>Staff Daily Breakdown</h4>
          <table className="report-table">
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Service Date</th>
                <th>Num Of Calls</th>
                <th>Total Service Call Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.staffDaily.map((r, idx) => (
                <tr key={`${r.staffName}-${r.serviceDate}-${idx}`}>
                  <td>{r.staffName}</td>
                  <td>{r.serviceDate}</td>
                  <td>{r.numCalls}</td>
                  <td>{fmt(r.totalAmount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>TOTAL</td>
                <td>-</td>
                <td>{report.totalCalls}</td>
                <td>{fmt(report.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {loading && <p className="report-loading">Loading report data...</p>}
    </div>
  );
};

export default OverallReportTab;
