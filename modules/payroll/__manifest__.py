{
    'name': 'Custom Payroll System',
    'version': '1.0',
    'category': 'Human Resources',
    'summary': 'Modul sederhana untuk menghitung gaji karyawan',
    'author': 'Kelompok 1 Enterprise, zeta',
    'depends': ['hr'],  # Bergantung pada modul Employee bawaan
    'data': [
        'views/payroll_view.xml',
    ],
    'installable': True,
    'application': True,
}