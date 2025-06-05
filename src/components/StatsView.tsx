"use client";

import { useMemo } from 'react';
import { OverallSuccessRateDisplay } from './analytics/OverallSuccessRateDisplay';
import { ProcessorSuccessRatesTable } from './analytics/ProcessorSuccessRatesTable';
import { TransactionDistributionChart } from './analytics/TransactionDistributionChart';
import { SuccessRateOverTimeChart } from './analytics/SuccessRateOverTimeChart';
import { VolumeOverTimeChart } from './analytics/VolumeOverTimeChart';
import { SavingsByNetworkChart } from './analytics/SavingsByNetworkChart';
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
      <div className="grid grid-cols-3 gap-6">
        {/* Total Savings (%) */}
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Savings (%)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallSavings.toFixed(2)}%</div>
          </CardContent>
        </Card>

        {/* Total Processed Amount */}
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Processed Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalAmount.toFixed(2)}</div>
          </CardContent>
        </Card>

        {/* Total Debit Routed Transactions */}
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debit Routed Transactions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{debitRoutedTxns}</div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Distribution Chart - Display only if data is available */}
      {hasDistributionData ? (
        <TransactionDistributionChart data={transactionDistributionData} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transaction Distribution</CardTitle>
            <CardDescription>Processor-wise distribution of transactions.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64">
            <div className="text-muted-foreground">No Distribution Data</div>
          </CardContent>
        </Card>
      )}

      {/* Success Rate Over Time Chart - Display only if simulation data is available */}
      {hasSimulationData ? (
        <SuccessRateOverTimeChart data={successRateHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Success Rate Over Time</CardTitle>
            <CardDescription>Overall and processor success rates over time.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64">
            <div className="text-muted-foreground">No Simulation Data Available</div>
          </CardContent>
        </Card>
      )}

      {/* Volume Over Time Chart - Display only if simulation data is available */}
      {hasSimulationData ? (
        <VolumeOverTimeChart data={volumeHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Volume Over Time</CardTitle>
            <CardDescription>Overall and processor transaction volume over time.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64">
            <div className="text-muted-foreground">No Simulation Data Available</div>
          </CardContent>
        </Card>
      )}

      {/* Savings by Network Chart - Display only if savings data is available */}
      {hasSavingsData ? (
        <SavingsByNetworkChart csvFilePath="/debit_routing_simulation_results.csv" simulationRunId={simulationRunId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Savings by Network</CardTitle>
            <CardDescription>Total savings per network from the simulation.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64">
            <div className="text-muted-foreground">No savings data available yet for debit routed transactions. Run a simulation.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
