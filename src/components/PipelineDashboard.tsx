import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { FreelanceJob } from '../types';

interface PipelineDashboardProps {
  jobs: FreelanceJob[];
}

export const PipelineDashboard: React.FC<PipelineDashboardProps> = ({ jobs }) => {
  const d3Container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = d3Container.current;
    if (!container) return;

    let rafId = 0;
    const draw = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const width = container.offsetWidth;
        // guard: skip rendering if the container is hidden/zero-width (avoids
        // inverted ranges / NaN widths which break SVG <rect width>)
        if (!width || width < 100) {
          return;
        }

        d3.select(container).selectAll('*').remove();
        const height = 300;
        const svg = d3
          .select(container)
          .append('svg')
          .attr('width', '100%')
          .attr('height', height)
          .attr('viewBox', `0 0 ${width} ${height}`);

        // Data funnel: New -> Bidded -> In Progress -> Ready -> Completed
        const stages = ['new', 'bidded', 'in_progress', 'ready', 'completed'];
        const data = stages.map((status) => ({
          status,
          count: jobs.filter((j) => j.status === status).length,
        }));

        const xScale = d3
          .scaleBand()
          .domain(stages)
          .range([50, width - 50])
          .padding(0.4);

        const yScale = d3
          .scaleLinear()
          .domain([0, (d3.max(data, (d) => d.count) || 1) as number])
          .range([height - 50, 50]);

        svg
          .selectAll('.bar')
          .data(data)
          .enter()
          .append('rect')
          .attr('class', 'bar')
          .attr('x', (d) => xScale(d.status) as number)
          .attr('width', xScale.bandwidth())
          .attr('y', height - 50)
          .attr('height', 0)
          .attr('fill', '#3B82F6')
          .transition()
          .duration(1000)
          .attr('y', (d) => yScale(d.count) as number)
          .attr('height', (d) => (height - 50) - (yScale(d.count) as number));

        // Add labels
        svg
          .selectAll('.label')
          .data(data)
          .enter()
          .append('text')
          .attr('x', (d) => (xScale(d.status) as number) + xScale.bandwidth() / 2)
          .attr('y', (d) => (yScale(d.count) as number) - 10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#94A3B8')
          .text((d) => d.count);
      });
    };

    draw();

    // Redraw on resize so the funnel stays correct inside narrow/hidden containers
    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [jobs]);

  return <div ref={d3Container} className="w-full" />;
};
