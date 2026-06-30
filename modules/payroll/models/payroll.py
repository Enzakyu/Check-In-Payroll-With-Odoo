from odoo import models, fields, api

class CustomPayroll(models.Model):
    _name = 'custom.payroll'
    _description = 'Data Penggajian Karyawan'

    name = fields.Char(string='Nomor Slip', required=True, copy=False, readonly=True, 
                       index=True, default=lambda self: self.env['ir.sequence'].next_by_code('custom.payroll') or 'NEW')

    employee_id = fields.Many2one('hr.employee', string='Karyawan', required=True)
    date_from = fields.Date(string='Periode Mulai', required=True, default=fields.Date.today)
    date_to = fields.Date(string='Periode Selesai', required=True, default=fields.Date.today)

    # Komponen Keuangan
    wage_basic = fields.Float(string='Gaji Pokok', required=True, default=0.0)
    allowance = fields.Float(string='Tunjangan', default=0.0)
    deduction = fields.Float(string='Potongan', default=0.0)

    # Hasil Akhir (Computed)
    wage_net = fields.Float(string='Gaji Bersih', compute='_compute_wage_net', store=True)

    state = fields.Selection([
        ('draft', 'Draft'),
        ('approved', 'Disetujui'),
        ('paid', 'Dibayarkan')
    ], string='Status', default='draft', track_visibility='onchange')

    @api.depends('wage_basic', 'allowance', 'deduction')
    def _compute_wage_net(self):
        for record in self:
            # Rumus matematika dasar penggajian
            record.wage_net = record.wage_basic + record.allowance - record.deduction

    def action_approve(self):
        self.write({'state': 'approved'})

    def action_pay(self):
        self.write({'state': 'paid'})