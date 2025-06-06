"use client";

import { useMemo } from 'react';
import { OverallSuccessRateDisplay } from './analytics/OverallSuccessRateDisplay';
import { ProcessorSuccessRatesTable } from './analytics/ProcessorSuccessRatesTable';
import { TransactionDistributionChart } from './analytics/TransactionDistributionChart';
import { SuccessRateOverTimeChart } from './analytics/SuccessRateOverTimeChart';
import { SavingsByNetworkChart } from './analytics/SavingsByNetworkChart';
import { DailySavingsChart } from './analytics/DailySavingsChart';
import { DailyVolumeChart } from './analytics/DailyVolumeChart';
import type { FormValues } from '@/components/BottomControlsPanel';
// import { PROCESSORS } from '@/lib/constants'; // PROCESSORS import removed
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ListChecks, CheckCircle2, XCircle, Gauge, DollarSign } from 'lucide-react';
import type { OverallSRHistory, MerchantConnector } from '@/lib/types'; // Added MerchantConnector

interface StatsViewProps {
  currentControls?: FormValues | null;
  merchantConnectors?: MerchantConnector[];
  processedPayments?: number;
  totalSuccessful?: number;
  totalFailed?: number;
  overallSuccessRateHistory?: OverallSRHistory;
  parentTab?: 'intelligent-routing' | 'least-cost-routing';
  successRateHistory?: any;
  volumeHistory?: any;
  connectorToggleStates?: any;
  overallSavingsPercentage?: number;
  totalProcessedAmount?: number;
  totalDebitRoutedTransactions?: number;
  simulationRunId?: string | number | null;
  transactionDistributionData?: Array<{ name: string; value: number }>;
  dailySavingsData?: { regulated: number; unregulated: number } | null;
  dailyVolumeData?: { regulated: number; unregulated: number } | null;
  savingsByNetworkData?: { [network: string]: number };
}

const CHART_COLORS_HSL = {
  '--chart-1': 'hsl(var(--chart-1))',
  '--chart-2': 'hsl(var(--chart-2))',
  '--chart-3': 'hsl(var(--chart-3))',
  '--chart-4': 'hsl(var(--chart-4))',
  '--chart-5': 'hsl(var(--chart-5))',
};

const chartColorKeys = Object.keys(CHART_COLORS_HSL) as (keyof typeof CHART_COLORS_HSL)[];

export function StatsView({
  currentControls,
  merchantConnectors = [],
  processedPayments,
  totalSuccessful,
  totalFailed,
  overallSuccessRateHistory,
  parentTab,
  successRateHistory,
  volumeHistory,
  connectorToggleStates,
  overallSavingsPercentage,
  totalProcessedAmount,
  totalDebitRoutedTransactions,
  simulationRunId,
  transactionDistributionData = [],
  dailySavingsData = null,
  dailyVolumeData = null,
  savingsByNetworkData,
}: StatsViewProps) {
  const overallSR = currentControls?.overallSuccessRate ?? 0;
  const totalTxns = (totalSuccessful || 0) + (totalFailed || 0);
  const overallSavings = overallSavingsPercentage || 0;
  const totalAmount = totalProcessedAmount || 0;
  const debitRoutedTxns = totalDebitRoutedTransactions || 0;

  // Determine if any data is available for the charts that rely on simulation results
  const hasSimulationData = successRateHistory && successRateHistory.length > 0;
  const hasDistributionData = transactionDistributionData && transactionDistributionData.length > 0;
  const hasSavingsData = totalAmount > 0 || debitRoutedTxns > 0 || (transactionDistributionData && transactionDistributionData.some(d => d.value > 0));
  const hasDailySavingsData = dailySavingsData !== null && (dailySavingsData.regulated > 0 || dailySavingsData.unregulated > 0);

  const processorSRData = useMemo(() => {
    if (!currentControls?.processorWiseSuccessRates) {
      return [];
    }

    return Object.keys(currentControls.processorWiseSuccessRates)
      .map(processorId => {
        const processorData = currentControls.processorWiseSuccessRates![processorId];
        const connectorInfo = merchantConnectors?.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
        const processorName = connectorInfo ? connectorInfo.connector_name : processorId;
        
        const successfulPayments = processorData.successfulPaymentCount;
        const totalPayments = processorData.totalPaymentCount;
        const calculatedSr = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

        return {
          processor: processorName,
          sr: calculatedSr, 
          successfulPaymentCount: successfulPayments,
          totalPaymentCount: totalPayments,
          // Use totalPaymentCount for sorting by volume, or volumeShare if still needed for other charts
          volumeForSort: totalPayments,
        };
      })
      // Sort by total payments for this processor as a proxy for volume
      .sort((a, b) => b.volumeForSort - a.volumeForSort)
      .map(({ volumeForSort, ...rest }) => rest); // Remove temporary sort key
  }, [currentControls?.processorWiseSuccessRates, merchantConnectors]);

  // Card headings based on parentTab
  const headings = parentTab === 'least-cost-routing'
    ? [
        'Total Savings (%)',
        'Total Amount Processed',
        'Total Debit Routed Transactions',
      ]
    : [
        'Total Processed',
        'Total Successful',
        'Total Failed',
      ];

  console.log('PROPS TO StatsView', { overallSavingsPercentage, totalProcessedAmount, totalDebitRoutedTransactions });

  return (
    <div className="space-y-6 flex flex-col">
      {/* Stats Cards in a single row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pl-6 pr-10 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Savings</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-6 pl-6 pr-6">
            {/* Calculate total monthly savings by summing regulated and unregulated */}
            <div className="text-2xl font-bold">${((dailySavingsData?.regulated || 0) + (dailySavingsData?.unregulated || 0)).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pl-6 pr-10 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Amount Processed</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-6 pl-6 pr-6">
            <div className="text-2xl font-bold">${totalProcessedAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pl-6 pr-10 pb-2">
            <CardTitle className="text-sm font-medium">Total Debit Routed Transactions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-6 pl-6 pr-6">
            <div className="text-2xl font-bold">{totalDebitRoutedTransactions.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Regulated and Unregulated Savings Cards in a two-column grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Regulated Savings Card */}
        <Card>
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle className="text-sm font-medium">Regulated Savings</CardTitle>
          </CardHeader>
          <CardContent className="py-6 px-6">
            <div className="text-4xl font-bold">${dailySavingsData?.regulated?.toFixed(2) || '0.00'}</div>
          </CardContent>
        </Card>

        {/* Unregulated Savings Card */}
        <Card>
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle className="text-sm font-medium">Unregulated Savings</CardTitle>
          </CardHeader>
          <CardContent className="py-6 px-6">
            <div className="text-4xl font-bold">${dailySavingsData?.unregulated?.toFixed(2) || '0.00'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Distribution Chart - Display only if data is available */}
      {hasDistributionData ? (
        <TransactionDistributionChart data={transactionDistributionData} />
      ) : (
        <Card>
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle>Transaction Distribution</CardTitle>
            <CardDescription>Network-wise distribution of transactions</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64 px-6 py-4">
            <div className="text-muted-foreground">No Distribution Data</div>
          </CardContent>
        </Card>
      )}

      {/* Savings by Network Chart - Display only if savings data is available */}
      {hasSavingsData ? (
        <SavingsByNetworkChart data={savingsByNetworkData} simulationRunId={simulationRunId} />
      ) : (
        <Card>
          <CardHeader className="px-6 pt-4 pb-2">
            <CardTitle>Savings by Network</CardTitle>
            <CardDescription>Total savings per network</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64 px-6 py-4">
            <div className="text-muted-foreground">No savings data available yet for debit routed transactions. Run a simulation.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
