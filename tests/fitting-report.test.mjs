import test from 'node:test';
import assert from 'node:assert/strict';
import {nearMissText,fittingResultText} from '../ui/fitting-report.mjs';

test('near-miss readout distinguishes global and per-face edge deviation and numerical classification',()=>{
  const text=nearMissText({nearlyRegularFaces:true,maximumEdgeDeviationPercent:10,maximumFaceEdgeDeviationPercent:.02,maximumFaceAngleDeviationDegrees:.1,maximumPlanarity:1e-8});
  assert.match(text,/Nearly regular faces.*numerical/);assert.match(text,/10.0% max from global mean/);
  assert.match(text,/0.0200% max from face mean/);assert.match(text,/0.100° max/);
  assert.match(text,/1.00e-8 × mean edge/);assert.match(text,/No catalog classification inferred/);
  assert.equal(nearMissText(null),'');assert.equal(nearMissText({unavailable:'Unsupported'}),'');
  assert.equal(nearMissText({maximumEdgeDeviationPercent:NaN}),'');
});

test('optimizer success with unresolved residuals is reported as not converged',()=>{
  const packet={status:'stationary-residual',model:{},evidence:{converged:false,requestedConstraintsSatisfied:false,
    solverTermination:{success:true,evaluations:12},residuals:{maximum:.1,rms:.01,maximumPlanarity:0},
    conditions:{'regular-faces':{before:{maximum:.4,rms:.2},after:{maximum:.1,rms:.01}}}}};
  const text=fittingResultText(packet);assert.match(text,/Not converged · tolerance not met/);
  assert.match(text,/max 4.000e-1 → 1.000e-1; RMS 2.000e-1 → 1.000e-2/);
  assert.match(text,/12 evaluations/);
});

test('invalid geometry prints diagnostics even when optimization terminates',()=>{
  const packet={status:'invalid-realization',model:null,evidence:{converged:false,requestedConstraintsSatisfied:false,
    solverTermination:{success:true,evaluations:2},residuals:{maximum:0,rms:0,maximumPlanarity:0},
    geometricValidity:{passed:false,diagnostics:['Fitted vertices coincide.']}}};
  assert.match(fittingResultText(packet),/Invalid fitted boundary: Fitted vertices coincide/);
  packet.model={};packet.status='constraints-satisfied';packet.evidence.converged=true;packet.evidence.requestedConstraintsSatisfied=true;
  assert.match(fittingResultText(packet),/^Converged · tolerance met/);
});
