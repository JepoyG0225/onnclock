import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { accountingAccess } from "@/lib/accounting/access";
import { sourceDocument } from "@/lib/accounting/sources";
import { mappingLabels } from "@/lib/accounting/policy";
import { prisma } from "@/lib/prisma";


function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await accountingAccess();
  if (error) return error;
  const runId = req.nextUrl.searchParams.get("runId");
  const type = req.nextUrl.searchParams.get("type");
  if (!runId || !type) {
    const runs = await prisma.payrollRun.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: ["APPROVED", "LOCKED", "DISBURSED"] },
      },
      select: {
        id: true,
        periodLabel: true,
        payDate: true,
        status: true,
        totalNetPay: true,
        _count: { select: { payslips: true } },
      },
      orderBy: { payDate: "desc" },
      take: 24,
    });
    return NextResponse.json({
      runs: runs.map((run) => ({
        ...run,
        totalNetPay: Number(run.totalNetPay),
        employeeCount: run._count.payslips,
        _count: undefined,
      })),
    });
  }

  if (!["quickbooks", "xero", "bank"].includes(type))
    return NextResponse.json(
      { error: "Unsupported export type." },
      { status: 422 },
    );

  const run = await prisma.payrollRun.findFirst({
    where: {
      id: runId,
      companyId: ctx.companyId,
      status: { in: ["APPROVED", "LOCKED", "DISBURSED"] },
    },
    include: {
      company: { select: { name: true, payrollCurrency: true } },
      payslips: {
        include: {
          employee: {
            select: {
              employeeNo: true,
              firstName: true,
              lastName: true,
              bankName: true,
              bankAccountNo: true,
              bankBic: true,
            },
          },
        },
      },
    },
  });
  if (!run)
    return NextResponse.json(
      { error: "Approved payroll run not found." },
      { status: 404 },
    );

  const payDate = format(run.payDate, "MM/dd/yyyy");
  const fileDate = format(run.payDate, "yyyy-MM-dd");
  let rows: unknown[][];
  let filename: string;

  if (type === "bank") {
    rows = [
      [
        "Employee No",
        "Account Name",
        "Bank",
        "Account Number",
        "BIC/SWIFT",
        "Amount",
        "Currency",
        "Reference",
      ],
    ];
    for (const payslip of run.payslips) {
      rows.push([
        payslip.employee.employeeNo,
        `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        payslip.employee.bankName ?? "",
        payslip.employee.bankAccountNo ?? "",
        payslip.employee.bankBic ?? "",
        Number(payslip.netPay).toFixed(2),
        run.company.payrollCurrency,
        `Payroll ${run.periodLabel}`,
      ]);
    }
    filename = `bank-payments-${fileDate}.csv`;
  } else {
    let document;
    try { document = await sourceDocument(ctx.companyId, 'PAYROLL', run.id); }
    catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Payroll does not balance.'},{status:422}); }
    const entries = document.lines.map(line=>[mappingLabels[line.account], Math.max(0,line.amount), Math.max(0,-line.amount)]);

    if (type === "quickbooks") {
      rows = [
        [
          "Journal No.",
          "Journal Date",
          "Account Name",
          "Debits",
          "Credits",
          "Description",
        ],
      ];
      entries.forEach(([account, debit, credit]) =>
        rows.push([
          run.id.slice(-8).toUpperCase(),
          payDate,
          account,
          Number(debit).toFixed(2),
          Number(credit).toFixed(2),
          `${run.company.name} payroll — ${run.periodLabel}`,
        ]),
      );
      filename = `quickbooks-payroll-${fileDate}.csv`;
    } else {
      rows = [
        [
          "Narration",
          "Date",
          "AccountCode",
          "AccountName",
          "Description",
          "TaxRate",
          "Debit",
          "Credit",
        ],
      ];
      entries.forEach(([account, debit, credit]) =>
        rows.push([
          `Payroll — ${run.periodLabel}`,
          payDate,
          "",
          account,
          run.company.name,
          "Tax Exempt",
          Number(debit).toFixed(2),
          Number(credit).toFixed(2),
        ]),
      );
      filename = `xero-payroll-${fileDate}.csv`;
    }
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
