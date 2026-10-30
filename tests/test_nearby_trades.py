"""Nearby loops must work without a local market and rank before limiting."""
import unittest
from tests import test_personal


class NearbyDiscoveryTests(unittest.TestCase):
    def setUp(self):
        f = self.fixture = test_personal.PersonalTests()
        f.setUp()
        f.locals = []
        f.origin['system_name'] = 'Elsewhere'
        f.origin['distance'] = 10
        f.third['distance'] = 41
        f.nearby = [f.origin, f.third]
        self.desk = f.desk

    def test_no_local_market_and_reverse_loop_deduplication(self):
        result = self.desk.search({'scope': 'nearby'})
        self.assertEqual(result['settings']['limit'], 5)
        self.assertEqual(result['matched'], 1)
        row = result['rows'][0]
        self.assertEqual(row['buy']['system'], 'Elsewhere')
        self.assertEqual(row['start_distance'], 10)
        self.assertEqual(row['profit'], 40000)
        self.assertEqual(len(self.fixture.calls), 1)

    def test_limit_applied_after_ranking_and_does_not_reduce_coverage(self):
        f = self.fixture
        for index in range(4, 12):
            market = f.station(index, 'System '+str(index), index, [f.item('Gold', 0, index*100), f.item('Silver', 100, 0)])
            market['distance'] = index
            f.nearby.append(market)
        result = self.desk.search({'scope': 'nearby', 'radius': 10, 'limit': 1})
        self.assertEqual(result['matched'], 9)
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(result['rows'][0]['sell']['market_id'], 11)
        self.assertEqual(result['screened'], 10)
        self.assertEqual(f.calls[0][1]['size'], 100)
        self.assertEqual(len(self.desk.search({'scope': 'nearby'})['rows']), 5)

    def test_travel_radius_and_leg_distance_are_independent(self):
        self.assertFalse(self.desk.search({'scope': 'nearby', 'radius': 9})['rows'])
        self.assertTrue(self.desk.search({'scope': 'nearby', 'radius': 10})['rows'])
        self.assertFalse(self.desk.search({'scope': 'nearby', 'distance': 40})['rows'])

    def test_invalid_limits_and_missing_distances(self):
        for value in (0, -1, 31, 1.5, True, 'bad'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.desk.search({'scope': 'nearby', 'limit': value})
        for station in self.fixture.nearby:
            station.pop('distance')
        self.assertFalse(self.desk.search({'scope': 'nearby'})['rows'])

    def test_full_load_and_affordability_apply_to_nearby(self):
        self.fixture.journal['credits'] = 1
        self.assertFalse(self.desk.search({'scope': 'nearby', 'affordable': '1'})['rows'])
        self.fixture.third['market'][1]['supply'] = 99
        self.assertFalse(self.desk.search({'scope': 'nearby'})['rows'])

    def test_selected_destination_station_is_preserved(self):
        f = self.fixture
        f.origin['system_name'] = 'Sol'
        f.locals = [f.origin]
        self.assertTrue(self.desk.search({'destination': 'Beta', 'destination_station': 'Port 3'})['rows'])
        self.assertFalse(self.desk.search({'destination': 'Beta', 'destination_station': 'Other port'})['rows'])
