function event(id, description, date, done, lane = 0) {
  return {
    id,
    description,
    kind: done ? 'fact' : 'action',
    occurred: done ? date : null,
    triggered: date,
    planned: date,
    scheduled: date,
    actual: done ? date : null,
    done,
    lane,
  };
}
export const sample = {
  projects: [
    {
      id: 'alpha',
      name: 'Project Alpha',
      description: 'Power transformer installation · 33/132 kV',
      // Fictitious commercial details for demonstration only. No VAT rate is assumed.
      details: {
        customer: 'Example Industrial Customer',
        scope: 'Supply, installation and testing of a 33/132 kV power transformer.',
        currency: 'SAR',
        value: 250000,
        vatRate: null,
        paymentTerms: [
          { label: 'Advance payment', percent: 30, condition: 'On order confirmation' },
          { label: 'Delivery payment', percent: 60, condition: 'Within 30 days of invoice' },
          { label: 'Final payment', percent: 10, condition: 'On customer acceptance' },
        ],
      },
      tasks: [
        {
          id: 'drawings',
          name: 'Technical Drawings',
          events: [
            event('d1', 'Drawing preparation started', '2026-09-03', true),
            event('d2', 'Drawings submitted to customer', '2026-09-08', true),
            event('d3', 'Customer requested an additional breaker', '2026-09-12', true, 1),
            event('d4', 'Engineering checked breaker feasibility', '2026-09-17', true, 1),
            event('d5', 'Customer comments received', '2026-09-20', true),
            event('d6', 'Revised drawings submitted', '2026-09-28', true),
            event('d7', 'Follow up on drawing approval', '2026-10-10', false),
            event('d8', 'Receive final drawing approval', '2026-10-15', false),
          ],
          edges: [
            ['d1', 'd2'],
            ['d2', 'd5'],
            ['d2', 'd3'],
            ['d3', 'd4'],
            ['d4', 'd6'],
            ['d5', 'd6'],
            ['d6', 'd7'],
            ['d7', 'd8'],
          ],
        },
        {
          id: 'materials',
          name: 'Material Approval',
          events: [
            event('m1', 'Material documents submitted', '2026-09-10', true),
            event('m2', 'Customer feedback received', '2026-09-17', true),
            event('m3', 'Revised material documents sent', '2026-09-25', true),
            event('m4', 'Material approval received', '2026-10-02', true),
          ],
          edges: [
            ['m1', 'm2'],
            ['m2', 'm3'],
            ['m3', 'm4'],
          ],
        },
        {
          id: 'fat',
          name: 'Factory Acceptance Test',
          events: [
            event('f1', 'Prepare FAT procedure', '2026-10-15', false),
            event('f2', 'Conduct factory acceptance test', '2026-10-22', false),
            event('f3', 'Send FAT report to customer', '2026-10-28', false),
          ],
          edges: [
            ['f1', 'f2'],
            ['f2', 'f3'],
          ],
        },
        {
          id: 'shipment',
          name: 'Shipment',
          events: [
            event('s1', 'Equipment ready for shipment', '2026-11-05', false),
            event('s2', 'Issue shipping documents', '2026-11-12', false),
            event('s3', 'Dispatch equipment', '2026-11-18', false),
            event('s4', 'Confirm delivery', '2026-11-25', false),
          ],
          edges: [
            ['s1', 's2'],
            ['s2', 's3'],
            ['s3', 's4'],
          ],
        },
      ],
    },
  ],
};
