"use client";

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

interface SavingsByNetworkChartProps {
  data?: { [network: string]: number };
  simulationRunId?: string | number | null;
}

interface SavingsData {
  network: string;
  totalSavings: number;
  color?: string;
}

// Define a color palette
const BAR_COLORS = [
  '#FF6347', // Tomato
  '#4682B4', // SteelBlue
  '#FFD700', // Gold
  '#6A5ACD', // SlateBlue
  '#3CB371', // MediumSeaGreen
  '#FF8C00', // DarkOrange
  '#40E0D0', // Turquoise
  '#EE82EE', // Violet
  '#90EE90', // LightGreen
  '#ADD8E6', // LightBlue
];

export function SavingsByNetworkChart({ data, simulationRunId }: SavingsByNetworkChartProps) {
  const [savingsData, setSavingsData] = useState<SavingsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Process data received from the parent component
    if (data) {
      setLoading(true); // Still show loading briefly while processing
      setError(null);

      const uniqueNetworks = Object.keys(data);
      const processedData: SavingsData[] = uniqueNetworks
        .filter(network => network !== 'N/A') // Filter out N/A networks
        .map((network, index) => ({
          network,
          totalSavings: parseFloat((data[network] || 0).toFixed(2)), // Use data from prop, round to 2 decimal places
          color: BAR_COLORS[index % BAR_COLORS.length], // Assign a color
        }));

      const sortedData = processedData.sort((a, b) => b.totalSavings - a.totalSavings); // Sort by total savings descending

      console.log("Processed Savings Data for Chart:", sortedData); // Log the data being used for the chart
      setSavingsData(sortedData);
      setLoading(false);
    } else {
      // If no data is provided, reset or show initial state
      setSavingsData([]);
      setLoading(false);
    }

    // No need to fetch CSV anymore, remove the fetchAndProcessCsv function call
  }, [data, simulationRunId]); // Depend on data and simulationRunId

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
          <CardDescription>Total savings per network from the simulation.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Loading savings data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!savingsData || savingsData.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
          <CardDescription>Total savings per network from the simulation.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">No savings data available yet for debit routed transactions. Run a simulation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-6">
        <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary" /> Savings by Network</CardTitle>
        <CardDescription>Total savings per network from the simulation.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={savingsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="network" stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `$` + value.toLocaleString()} />
            <Tooltip formatter={(value: number) => [`$` + value.toFixed(2), "Total Savings"]} />
            <Bar dataKey="totalSavings" barSize={90}>
              {savingsData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
} 