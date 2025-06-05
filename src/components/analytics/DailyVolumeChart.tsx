import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChartBig } from 'lucide-react';

interface DailyVolumeChartProps {
  data: { regulated: number; unregulated: number } | null;
}

const BAR_COLORS = [
  '#4682B4', // SteelBlue for Regulated
  '#FF8C00', // DarkOrange for Unregulated
];

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-popover border border-border rounded-lg shadow-xs text-popover-foreground text-xs">
        <p className="mb-2 font-semibold text-sm">Date: {new Date(label).toLocaleDateString()}</p>
        {payload.map((pld: any, index: number) => (
          <div key={index} className="mb-1.5 last:mb-0">
            <div className="flex items-center mb-0.5">
              <div style={{ width: '10px', height: '10px', backgroundColor: pld.stroke, marginRight: '6px', borderRadius: '2px' }} />
              <span className="font-medium text-popover-foreground">{pld.name}: <span className="font-semibold">{parseInt(pld.value, 10).toLocaleString()}</span></span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function DailyVolumeChart({ data }: DailyVolumeChartProps) {
  // Transform data for LineChart
  const chartData = data ? [{
    date: Date.now(),
    'Regulated Successful': data.regulated,
    'Unregulated Successful': data.unregulated,
  }] : [];

  // Check if there is any volume data to display
  const hasVolumeData = data !== null && (data.regulated > 0 || data.unregulated > 0);

  if (!hasVolumeData) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center"><BarChartBig className="mr-2 h-5 w-5 text-primary" /> Daily Volume</CardTitle>
          <CardDescription>Number of successful regulated and unregulated debit routed transactions.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center p-6">
          <p className="text-muted-foreground">No daily volume data available yet. Run a simulation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-6">
        <CardTitle className="flex items-center"><BarChartBig className="mr-2 h-5 w-5 text-primary" /> Daily Volume</CardTitle>
        <CardDescription>Number of successful regulated and unregulated debit routed transactions.</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(timestamp) => new Date(timestamp).toLocaleDateString()}
              domain={['dataMin', 'dataMax']}
              type="number"
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(value) => value.toLocaleString()}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', paddingTop: '10px' }} />
            <Line type="monotone" dataKey="Regulated Successful" stroke={BAR_COLORS[0]} name="Regulated Successful" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="Unregulated Successful" stroke={BAR_COLORS[1]} name="Unregulated Successful" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
