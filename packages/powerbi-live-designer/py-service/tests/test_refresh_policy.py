import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_policy import build_plan

QUERY = "EVALUATE ROW(\"SalesRows\", COUNTROWS('Sales'))"

class RefreshPolicyTests(unittest.TestCase):
    def test_targeted_source_refresh(self):
        p = build_plan({'changes':[{'kind':'source_data','tables':['Sales'],'storage':'Import','lineageVerified':True}], 'daxQueries':[QUERY]})
        self.assertTrue(p.executable)
        self.assertEqual(p.reload, 'none')
        self.assertEqual(p.processing, [{'type':'Full','target':'table','table':'Sales'}])
    def test_unverified_lineage_blocks(self):
        p = build_plan({'changes':[{'kind':'source_data','tables':['Sales'],'storage':'Import'}], 'daxQueries':[QUERY]})
        self.assertFalse(p.executable)
    def test_non_import_blocks_full(self):
        p = build_plan({'changes':[{'kind':'source_data','tables':['Sales'],'storage':'DirectQuery','lineageVerified':True}], 'daxQueries':[QUERY]})
        self.assertFalse(p.executable)
    def test_tmdl_measure_calculate(self):
        p = build_plan({'changes':[{'kind':'measure','fileEdit':True}], 'daxQueries':[QUERY], 'tmdlValidated':True})
        self.assertTrue(p.executable)
        self.assertEqual(p.reload,'model')
        self.assertEqual(p.processing,[{'type':'Calculate','target':'model'}])
    def test_pbir_only(self):
        p = build_plan({'changes':[{'kind':'pbir'}], 'daxQueries':[QUERY]})
        self.assertEqual(p.reload,'report')
        self.assertFalse(p.processing)
    def test_require_dax(self):
        p = build_plan({'changes':[{'kind':'pbir'}]})
        self.assertFalse(p.executable)
    def test_unknown_refuses(self):
        p = build_plan({'changes':[{'kind':'unknown'}], 'daxQueries':[QUERY]})
        self.assertFalse(p.executable)
    def test_multi_dedup(self):
        p = build_plan({'changes':[{'kind':'source_data','tables':['Sales','Sales','Budget'],'storage':'Import','lineageVerified':True}], 'daxQueries':[QUERY]})
        self.assertEqual([x['table'] for x in p.processing],['Budget','Sales'])

if __name__ == '__main__': unittest.main()
