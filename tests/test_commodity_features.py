"""Carrier selection, affordability, cargo buyers and actual journal profits."""
import unittest
import json
from pathlib import Path
from unittest.mock import patch
import test_personal
from modules.personal.extras import TradingExtras

class CommodityFeatureTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_personal.PersonalTests()
        self.fixture.setUp()
        self.f=self.fixture
        self.extra=TradingExtras(self.f.core)

    def test_carriers_toggle_and_access(self):
        self.f.third.update(type='Drake-Class Carrier',carrier_name='Test ship',carrier_docking_access='friends')
        self.assertFalse(self.f.desk.search({})['rows'])
        row=self.f.desk.search({'carriers':'1'})['rows'][0]
        self.assertTrue(row['sell']['carrier'])
        self.assertEqual(row['sell']['docking_access'],'friends')

    def test_affordable_only_unknown_balance_and_sort(self):
        self.f.journal['credits']=9999
        self.assertFalse(self.f.desk.search({'affordable':'1'})['rows'])
        self.f.journal['credits']=None
        with self.assertRaisesRegex(ValueError,'balance unknown'):
            self.f.desk.search({'affordable':'1'})
        rows=self.f.desk.search({'route_type':'one_way','sort':'distance'})['rows']
        self.assertEqual([r['distance'] for r in rows],[39,41])
        self.assertTrue(all(r['age_hours']>=0 for r in rows))

    def test_cargo_partial_demand_and_mission_exclusion(self):
        self.f.other['distance']=39
        self.f.third['distance']=41
        self.f.other['market'][0]['demand']=3
        self.f.journal['cargo']={'items':[{'key':'gold','name':'Gold','count':10,'stolen':2},
                                         {'key':'silver','name':'Silver','count':20,'mission_id':5}]}
        rows=self.extra.cargo({})['rows']
        self.assertTrue(rows)
        self.assertTrue(all(r['commodity']=='Gold' for r in rows))
        alpha=next(r for r in rows if r['system']=='Alpha')
        self.assertEqual(alpha['quantity'],3)
        self.assertEqual(alpha['held'],8)
        self.assertEqual(alpha['revenue'],1200)
        self.assertNotIn('profit',alpha)

    def test_affordable_return_can_use_cheaper_commodity(self):
        self.f.third['market'][1]['buy_price']=1000
        self.f.origin['market'][1]['sell_price']=1300
        self.f.third['market'].append(self.f.item('Copper',50,0))
        self.f.origin['market'].append(self.f.item('Copper',0,60))
        row=self.f.desk.search({'destination':'Beta','affordable':'1'})['rows'][0]
        self.assertEqual(row['legs'][1]['commodity'],'Copper')

    def test_history_actual_profit_unknown_cost_and_commander(self):
        self.f.journal['cmdr']='Trader'
        fixture=str(Path(__file__).parent/'fixtures'/'commodity-sales.jsonl')
        with patch('modules.personal.extras.journal_files',return_value=[fixture]):
            data=self.extra.history({'days':3650})
        self.assertEqual(data['sales'],2)
        self.assertEqual(data['profit'],3000)
        self.assertEqual(data['unknown_cost_sales'],1)
        self.assertIsNone(data['rows'][0]['profit'])

    def test_cargo_journal_preserves_mission_ownership(self):
        from test_elitelab import make_core
        core=make_core()
        data=json.loads((Path(__file__).parent/'fixtures/journals/commodity-cargo/Cargo.json').read_text())
        core.bus.emit('journal.file.Cargo',data)
        items=core.store.get('journal')['cargo']['items']
        self.assertEqual(items[0]['mission_id'],12345)
        self.assertEqual(items[1]['stolen'],1)

if __name__=='__main__':
    unittest.main()

