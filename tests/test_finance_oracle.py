"""Independent Decimal reference against the JavaScript journal on fictitious data."""
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import json
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
JS = r"""
const F=require('./finance'), E=require('./engine'), d=F.empty();
d.asOf='2025-01-02';
d.owners=[{id:'P',label:'Titulaire fictif'}];
d.portfolios=[{id:'v',ownerId:'P',label:'Portefeuille fictif',targets:E.targets}];
d.institutions=[{id:'a',label:'SGI fictive A'},{id:'b',label:'SGI fictive B'}];
d.accounts=['a','b'].map((id,i)=>({id,institutionId:id,portfolioId:'v',currency:'XOF',label:id,
  cash:i===0?1000:500,monthly:0,reserved:0,brokerRate:.01,otherRate:.006}));
d.positions=[{accountId:'a',symbol:'SNTS',qty:6,cost:540}];
const operations=[
  {type:'DEPOSIT',amount:1200},
  {type:'BUY',symbol:'SNTS',qty:4,price:121,broker:4,other:1,tax:2,actualTotal:491},
  {type:'SPLIT',symbol:'SNTS',ratioFrom:1,ratioTo:2,source:'Avis fictif'},
  {type:'SELL',symbol:'SNTS',qty:7,price:75,broker:4,other:1,tax:1,actualTotal:519},
  {type:'DIVIDEND',symbol:'SNTS',gross:100,tax:11,other:6},
  {type:'TRANSFER',toAccountId:'b',amount:200},
];
const state=operations.reduce((x,t,i)=>F.record(x,{...t,accountId:'a',date:'2025-01-0'+(i+3),
  brokerRef:'FICT-'+i}),d);
const [a,b]=F.calculate(state).accounts;
process.stdout.write(JSON.stringify({cash:a.cash, balance2:b.cash,qty:a.positions.SNTS.qty,
  cost:a.positions.SNTS.cost,pnl:a.realized,dividend:a.dividends,tax:a.taxes,fees:a.feesPaid}));
"""


class OracleTest(unittest.TestCase):
    def test_journal_against_independent_decimal_reference(self):
        output = subprocess.check_output(['node', '-e', JS], cwd=ROOT, text=True)
        actual = json.loads(output, parse_float=Decimal)
        buy_fee = 4 + 1 + 2
        sell_fee = 4 + 1 + 1
        net_dividend = 100 - 11 - 6
        quantity = (6 + 4) * 2
        cost = Decimal(6 * 90 + 4 * 121 + buy_fee)
        sold_cost = (cost * 7 / quantity).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        sale = 7 * 75 - sell_fee
        self.assertEqual(actual, {
            'cash': 1000 + 1200 - (4 * 121 + buy_fee) + sale + net_dividend - 200,
            'balance2': 500 + 200,
            'qty': quantity - 7,
            'cost': cost - sold_cost,
            'pnl': sale - sold_cost,
            'dividend': net_dividend,
            'tax': 2 + 1 + 11,
            'fees': (buy_fee - 2) + (sell_fee - 1) + 6,
        })
