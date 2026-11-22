/**
 * @file DiskSentinelPredictive.cpp
 * @brief Implementation of Pure Creative DLL: DiskSentinelPredictive.dll
 *        Zero-dependency predictive reliability, Weibull hazard, acoustic seek jitter,
 *        Arrhenius thermal wear, and S.M.A.R.T. OLS trend forecasting library.
 * @author AhBiYout (GitHub: AhBiYout-all)
 * @affiliation CISNet (https://www.cisnet.co.kr)
 * @blog https://ahbiyoutvibe.blogspot.com/
 * @license Apache-2.0
 */

#ifndef DSP_EXPORTS
#define DSP_EXPORTS
#endif
#include "DiskSentinelPredictive.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

// ---------------------------------------------------------------------------
// Internal Portable Helpers
// ---------------------------------------------------------------------------

static void dsp_safe_strncpy(char* dest, const char* src, size_t destSize) {
    if (!dest || destSize == 0) return;
    if (!src) { dest[0] = '\0'; return; }
    size_t i = 0;
    for (; i < destSize - 1 && src[i] != '\0'; ++i) {
        dest[i] = src[i];
    }
    dest[i] = '\0';
}

static double dsp_clamp(double val, double lo, double hi) {
    if (!isfinite(val)) return lo;
    if (val < lo) return lo;
    if (val > hi) return hi;
    return val;
}

static int dsp_cmp_double(const void* a, const void* b) {
    const double va = *(const double*)a;
    const double vb = *(const double*)b;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
}

static double dsp_weibull_cond_prob(double t0Hours, double deltaHours, double beta, double etaHours) {
    if (etaHours <= 1.0 || deltaHours <= 0.0 || beta <= 0.0) return 0.0;
    double ratio0 = t0Hours / etaHours;
    double ratio1 = (t0Hours + deltaHours) / etaHours;

    // Avoid pow overflow when ratio is very large
    if (ratio0 > 50.0) ratio0 = 50.0;
    if (ratio1 > 50.0) ratio1 = 50.0;

    double cum0 = pow(ratio0, beta);
    double cum1 = pow(ratio1, beta);
    double diff = cum0 - cum1; // Negative exponent
    if (!isfinite(diff)) return 1.0;
    if (diff >= 0.0) return 0.0;
    if (diff < -60.0) return 1.0;
    return dsp_clamp(1.0 - exp(diff), 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Export 1: Engine Info & Deterministic Mathematical Self-Test
// ---------------------------------------------------------------------------

DSP_API bool DSP_CALL DSP_GetPredictiveEngineInfo(DSPEngineInfo* outInfo) {
    if (!outInfo) return false;
    memset(outInfo, 0, sizeof(DSPEngineInfo));

    dsp_safe_strncpy(outInfo->engineName, "DiskSentinelPredictive Pure Creative Engine", sizeof(outInfo->engineName));
    dsp_safe_strncpy(outInfo->version, "4.6.0", sizeof(outInfo->version));
    outInfo->abiVersion = 1U;
    outInfo->capabilitiesMask =
        DSP_CAP_WEIBULL_RUL |
        DSP_CAP_ACOUSTIC_SEEK |
        DSP_CAP_THERMAL_ARRHENIUS |
        DSP_CAP_SMART_OLS_TREND;

    // Self-test 1: Weibull F(t=1000 | beta=2.0, eta=1000) == 1 - e^-1 (~0.6321205588)
    double expectedF = 1.0 - exp(-1.0);
    double actualF = dsp_weibull_cond_prob(0.0, 1000.0, 2.0, 1000.0);
    double weibullErr = fabs(actualF - expectedF);

    // Self-test 2: OLS regression over y = 2*x + 10 at days 0, 1, 2
    DSPSmartHistoryPoint pts[3];
    pts[0].timestampSec = 0;
    pts[0].value = 10.0;
    pts[1].timestampSec = 86400;
    pts[1].value = 12.0;
    pts[2].timestampSec = 172800;
    pts[2].value = 14.0;

    DSPSmartTrendProjection proj;
    bool olsOk = DSP_ProjectSmartDegradationTrend(pts, 3, 20.0, 30.0, 0, &proj);

    outInfo->weibullSelfTestError = weibullErr;
    outInfo->olsSelfTestR2 = olsOk ? proj.rSquared : 0.0;
    outInfo->selfTestPassed =
        (weibullErr < 1e-9 && olsOk && fabs(proj.slopePerDay - 2.0) < 1e-6 && proj.rSquared > 0.999999)
        ? 1U : 0U;

    return true;
}

// ---------------------------------------------------------------------------
// Export 2: Weibull Bathtub RUL & Conditional Failure Probability Estimator
// ---------------------------------------------------------------------------

DSP_API bool DSP_CALL DSP_ComputeWeibullRul(
    const DSPWeibullInput* input,
    DSPWeibullRulReport* outReport
) {
    if (!input || !outReport) return false;
    memset(outReport, 0, sizeof(DSPWeibullRulReport));

    // Nominal characteristic life (hours) per storage architecture
    double baseEta = 50000.0;
    double baseBeta = 1.35;
    switch (input->mediaType) {
        case DSP_MEDIA_NVME_SSD:
            baseEta = 75000.0;
            baseBeta = 1.25;
            break;
        case DSP_MEDIA_SATA_SSD:
            baseEta = 65000.0;
            baseBeta = 1.30;
            break;
        case DSP_MEDIA_USB_FLASH:
            baseEta = 25000.0;
            baseBeta = 1.45;
            break;
        case DSP_MEDIA_HDD:
        default:
            baseEta = 50000.0;
            baseBeta = 1.40;
            break;
    }

    double t0 = (double)input->powerOnHours;
    double avgDailyHours = (isfinite(input->avgDailyPowerOnHours) && input->avgDailyPowerOnHours > 0.25)
        ? dsp_clamp(input->avgDailyPowerOnHours, 0.25, 24.0)
        : 8.0;

    // Accumulate multiplicative scale degradation & shape steepening from defects
    double defectSeverity = 0.0;
    double maxDriverWeight = 0.0;
    const char* primaryDriver = "Nominal Aging Baseline";

    if (input->pendingSectors > 0) {
        double w = 0.45 * log1p((double)input->pendingSectors) + 0.06 * (double)input->pendingSectors;
        defectSeverity += w;
        if (w > maxDriverWeight) {
            maxDriverWeight = w;
            primaryDriver = "Pending Unstable Sectors (0xC5)";
        }
    }

    if (input->uncorrectableErrors > 0) {
        double w = 0.40 * log1p((double)input->uncorrectableErrors) + 0.05 * (double)input->uncorrectableErrors;
        defectSeverity += w;
        if (w > maxDriverWeight) {
            maxDriverWeight = w;
            primaryDriver = "Uncorrectable Media Errors (0xBB/0xC6)";
        }
    }

    if (input->reallocatedSectors > 0) {
        double w = 0.28 * log1p((double)input->reallocatedSectors) + 0.015 * (double)input->reallocatedSectors;
        defectSeverity += w;
        if (w > maxDriverWeight) {
            maxDriverWeight = w;
            primaryDriver = "Reallocated Spare Sectors (0x05)";
        }
    }

    // SSD / NVMe flash endurance depletion
    double usedClamped = dsp_clamp((double)input->percentageUsed, 0.0, 200.0);
    if (usedClamped >= 70.0) {
        double w = (usedClamped - 65.0) * 0.025;
        defectSeverity += w;
        if (w > maxDriverWeight) {
            maxDriverWeight = w;
            primaryDriver = "Flash Wear-Out Depletion (% Used)";
        }
    }

    if ((input->availableSparePct > 0 && input->availableSparePct < 40) ||
        (input->availableSparePct == 0 && (usedClamped >= 80.0 || input->uncorrectableErrors > 0))) {
        double w = (40.0 - (double)input->availableSparePct) * 0.04;
        defectSeverity += w;
        if (w > maxDriverWeight) {
            maxDriverWeight = w;
            primaryDriver = "Low Available Spare Blocks";
        }
    }

    // Thermal penalty above 45 C
    if (input->temperatureCelsius > 45 && input->temperatureCelsius < 150) {
        double thermalExcess = (double)(input->temperatureCelsius - 45);
        double w = thermalExcess * 0.035;
        defectSeverity += w;
        if (w > maxDriverWeight) {
            maxDriverWeight = w;
            primaryDriver = "Elevated Operating Temperature Stress";
        }
    }

    if (input->unsafeShutdowns > 50) {
        double w = 0.08 * log1p((double)(input->unsafeShutdowns - 50));
        defectSeverity += w;
    }

    // Adjust Weibull scale (eta) and shape (beta)
    // Higher defectSeverity shrinks eta (earlier failure) and raises beta (accelerating wear-out)
    double scaleFactor = exp(-dsp_clamp(defectSeverity * 0.42, 0.0, 4.5));
    double eta = baseEta * scaleFactor;
    if (eta < 720.0) eta = 720.0; // Floor at 30 operating days

    double beta = dsp_clamp(baseBeta + defectSeverity * 0.35 + (usedClamped * 0.005), 1.05, 3.80);

    // Conditional failure probabilities over 30 / 90 / 365 calendar days
    double p30  = dsp_weibull_cond_prob(t0, 30.0 * avgDailyHours, beta, eta);
    double p90  = dsp_weibull_cond_prob(t0, 90.0 * avgDailyHours, beta, eta);
    double p365 = dsp_weibull_cond_prob(t0, 365.0 * avgDailyHours, beta, eta);

    // Instantaneous Weibull hazard h(t0) = (beta / eta) * (t0 / eta)^(beta - 1), scaled per 1,000h
    double safeRatio = (t0 > 1.0) ? (t0 / eta) : (1.0 / eta);
    if (safeRatio > 20.0) safeRatio = 20.0;
    double hazardPerHour = (beta / eta) * pow(safeRatio, beta - 1.0);
    double hazardPer1k = dsp_clamp(hazardPerHour * 1000.0, 0.0, 1000.0);

    // Median conditional RUL: solve P(fail within delta_h | survived t0) = 0.50
    // ((t0 + delta_h)/eta)^beta = (t0/eta)^beta + ln(2)
    double baseCum = pow(dsp_clamp(t0 / eta, 0.0, 50.0), beta);
    double targetCum = baseCum + 0.6931471805599453; // ln(2)
    double targetTotalHours = eta * pow(targetCum, 1.0 / beta);
    double remainingHours = (targetTotalHours > t0) ? (targetTotalHours - t0) : 0.0;
    double estDaysDouble = remainingHours / avgDailyHours;
    if (!isfinite(estDaysDouble) || estDaysDouble < 0.0) estDaysDouble = 0.0;
    if (estDaysDouble > 3650.0) estDaysDouble = 3650.0;
    uint32_t estRulDays = (uint32_t)(estDaysDouble + 0.5);

    // Reliability score combining 90d survival with defect weighting
    double reliability = (1.0 - p90) * 100.0;
    reliability -= dsp_clamp(defectSeverity * 12.0, 0.0, 65.0);
    reliability = dsp_clamp(reliability, 0.0, 100.0);

    uint32_t grade = DSP_GRADE_OPTIMAL;
    if (p30 >= 0.25 || reliability < 35.0 || estRulDays <= 30) {
        grade = DSP_GRADE_CRITICAL;
    } else if (p90 >= 0.22 || reliability < 60.0 || estRulDays <= 120) {
        grade = DSP_GRADE_HIGH;
    } else if (p365 >= 0.25 || reliability < 80.0 || defectSeverity > 0.35) {
        grade = DSP_GRADE_MODERATE;
    } else if (reliability < 93.0 || defectSeverity > 0.05) {
        grade = DSP_GRADE_LOW;
    }

    outReport->weibullShapeBeta = beta;
    outReport->weibullScaleEtaHours = eta;
    outReport->failureProb30dPct = p30 * 100.0;
    outReport->failureProb90dPct = p90 * 100.0;
    outReport->failureProb365dPct = p365 * 100.0;
    outReport->hazardRatePer1kHours = hazardPer1k;
    outReport->reliabilityIndexPct = reliability;
    outReport->estimatedRulDays = estRulDays;
    outReport->riskGradeCode = grade;
    dsp_safe_strncpy(outReport->primaryRiskFactor, primaryDriver, sizeof(outReport->primaryRiskFactor));

    return true;
}

// ---------------------------------------------------------------------------
// Export 3: Acoustic Seek Instability, RMSSD Jitter & FTL GC Stall Analyzer
// ---------------------------------------------------------------------------

DSP_API bool DSP_CALL DSP_AnalyzeAcousticSeekProfile(
    const DSPAcousticSample* samples,
    uint32_t sampleCount,
    uint32_t mediaType,
    DSPAcousticProfile* outProfile
) {
    if (!outProfile) return false;
    if (!samples && sampleCount > 0) return false;
    memset(outProfile, 0, sizeof(DSPAcousticProfile));

    if (sampleCount == 0) {
        dsp_safe_strncpy(outProfile->diagnosticSummary, "No sector latency samples available", sizeof(outProfile->diagnosticSummary));
        return true;
    }

    // Collect finite non-negative latency indices for median baseline calculation
    double* sortedLat = (double*)malloc(sizeof(double) * sampleCount);
    if (!sortedLat) return false;

    uint32_t validCount = 0;
    uint32_t badStatusCount = 0;
    for (uint32_t i = 0; i < sampleCount; ++i) {
        if (samples[i].statusCode >= 4U || !isfinite(samples[i].latencyMs) || samples[i].latencyMs < 0.0) {
            badStatusCount++;
            continue;
        }
        sortedLat[validCount++] = samples[i].latencyMs;
    }

    if (validCount == 0) {
        free(sortedLat);
        outProfile->acousticGradeCode = (badStatusCount > 0) ? 3U : 0U;
        outProfile->acousticInstabilityScore = (badStatusCount > 0) ? 95.0 : 0.0;
        dsp_safe_strncpy(
            outProfile->diagnosticSummary,
            badStatusCount > 0 ? "All sampled blocks failed I/O (severe media fault)" : "No valid latency readings",
            sizeof(outProfile->diagnosticSummary)
        );
        return true;
    }

    qsort(sortedLat, validCount, sizeof(double), dsp_cmp_double);
    double medianMs = sortedLat[validCount / 2];
    free(sortedLat);

    bool isSolidState = (mediaType == DSP_MEDIA_SATA_SSD || mediaType == DSP_MEDIA_NVME_SSD);
    double stallFloor = isSolidState ? 15.0 : 35.0;
    double stallThresholdMs = (medianMs * 3.0 > stallFloor) ? (medianMs * 3.0) : stallFloor;

    double sumSqAll = 0.0;
    double sumAbsAll = 0.0;
    double peakDelta = 0.0;
    double sumSqSeq = 0.0;
    double sumSqRand = 0.0;
    uint32_t stepCount = 0;
    uint32_t seqCount = 0;
    uint32_t randCount = 0;
    uint32_t strideJumps = 0;
    uint32_t microStallBursts = 0;
    uint32_t currentStallRun = 0;

    bool hasPrev = false;
    uint64_t prevLba = 0;
    double prevLat = 0.0;

    for (uint32_t i = 0; i < sampleCount; ++i) {
        if (samples[i].statusCode >= 4U || !isfinite(samples[i].latencyMs) || samples[i].latencyMs < 0.0) {
            if (currentStallRun >= 2U) microStallBursts++;
            currentStallRun = 0;
            hasPrev = false;
            continue;
        }

        double curLat = samples[i].latencyMs;
        if (curLat >= stallThresholdMs) {
            currentStallRun++;
        } else {
            if (currentStallRun >= 2U) microStallBursts++;
            currentStallRun = 0;
        }

        if (hasPrev) {
            double delta = fabs(curLat - prevLat);
            sumAbsAll += delta;
            sumSqAll += delta * delta;
            if (delta > peakDelta) peakDelta = delta;
            stepCount++;

            bool isSequential = (samples[i].lba > prevLba) && ((samples[i].lba - prevLba) <= 131072ULL);
            if (isSequential) {
                sumSqSeq += delta * delta;
                seqCount++;
            } else {
                sumSqRand += delta * delta;
                randCount++;
                strideJumps++;
            }
        }

        prevLba = samples[i].lba;
        prevLat = curLat;
        hasPrev = true;
    }
    if (currentStallRun >= 2U) microStallBursts++;

    double rmssdAll = (stepCount > 0) ? sqrt(sumSqAll / (double)stepCount) : 0.0;
    double meanDelta = (stepCount > 0) ? (sumAbsAll / (double)stepCount) : 0.0;
    double seqRmssd = (seqCount > 0) ? sqrt(sumSqSeq / (double)seqCount) : rmssdAll;
    double randRmssd = (randCount > 0) ? sqrt(sumSqRand / (double)randCount) : seqRmssd;

    double resDenom = (seqRmssd > 0.25) ? seqRmssd : 0.25;
    double resonanceRatio = (randCount > 0)
        ? (randRmssd / resDenom)
        : (peakDelta / (medianMs > 0.25 ? medianMs : 0.25));
    if (!isfinite(resonanceRatio)) resonanceRatio = 1.0;

    // Normalize acoustic instability score (0..100) differently for Solid-State vs Rotational HDD
    double refJitter = isSolidState ? 6.0 : 18.0;
    double jitterComponent = dsp_clamp((rmssdAll / refJitter) * 42.0, 0.0, 55.0);
    double burstComponent = dsp_clamp((double)microStallBursts * 8.5, 0.0, 30.0);
    double peakComponent = dsp_clamp((peakDelta / (refJitter * 5.0)) * 15.0, 0.0, 15.0);
    double score = dsp_clamp(jitterComponent + burstComponent + peakComponent, 0.0, 100.0);

    uint32_t grade = 0U;
    const char* summary = isSolidState
        ? "Low NAND latency variance (FTL stable)"
        : "Quiet sequential seek track profile";

    if (score >= 70.0) {
        grade = 3U;
        summary = isSolidState
            ? "Severe FTL GC/die-stall spikes detected"
            : "Severe actuator seek settling oscillation detected";
    } else if (score >= 42.0) {
        grade = 2U;
        summary = isSolidState
            ? "Elevated NAND write-amplification / GC latency jitter"
            : "Moderate mechanical seek-jitter / track retry resonance";
    } else if (score >= 18.0) {
        grade = 1U;
        summary = isSolidState
            ? "Mild controller queue jitter within normal tolerance"
            : "Minor rotational seek step variance";
    }

    outProfile->validSampleCount = validCount;
    outProfile->consecutiveStepCount = stepCount;
    outProfile->microStallBurstCount = microStallBursts;
    outProfile->strideJumpCount = strideJumps;
    outProfile->acousticGradeCode = grade;
    outProfile->rmssdJitterMs = rmssdAll;
    outProfile->meanStepDeltaMs = meanDelta;
    outProfile->peakStepDeltaMs = peakDelta;
    outProfile->sequentialJitterMs = seqRmssd;
    outProfile->randomSeekJitterMs = randRmssd;
    outProfile->resonanceRatio = resonanceRatio;
    outProfile->acousticInstabilityScore = score;
    dsp_safe_strncpy(outProfile->diagnosticSummary, summary, sizeof(outProfile->diagnosticSummary));

    return true;
}

// ---------------------------------------------------------------------------
// Export 4: Arrhenius Thermal Acceleration & TBW Endurance Stress Evaluator
// ---------------------------------------------------------------------------

DSP_API bool DSP_CALL DSP_EvaluateThermalWearStress(
    const DSPThermalWearInput* input,
    DSPThermalWearReport* outReport
) {
    if (!input || !outReport) return false;
    memset(outReport, 0, sizeof(DSPThermalWearReport));

    // Arrhenius equation: AF = exp((Ea / kB) * (1/T_ref - 1/T_op))
    // Ea = 0.7 eV, kB = 8.617333262e-5 eV/K -> Ea/kB = 8123.166 K
    const double eaOverKb = 8123.166;
    const double tRefK = 35.0 + 273.15; // 35 C reference baseline

    double curC = (input->currentTempCelsius > 0 && input->currentTempCelsius < 150)
        ? (double)input->currentTempCelsius
        : 35.0;
    double peakC = (input->peakTempCelsius > 0 && input->peakTempCelsius < 150)
        ? (double)input->peakTempCelsius
        : curC;
    if (peakC < curC) peakC = curC;

    double tOpK = curC + 273.15;
    double af = exp(dsp_clamp(eaOverKb * ((1.0 / tRefK) - (1.0 / tOpK)), -5.0, 5.0));

    // Incorporate warning / critical excursion minutes over power-on lifetime
    double totalMin = (input->powerOnHours > 0) ? ((double)input->powerOnHours * 60.0) : 60.0;
    double warnRatio = dsp_clamp((double)input->warningTempTimeMin / totalMin, 0.0, 1.0);
    double critRatio = dsp_clamp((double)input->criticalTempTimeMin / totalMin, 0.0, 1.0);
    double excursionBoost = 1.0 + (warnRatio * 1.4) + (critRatio * 3.8);

    double sustainedFactor = dsp_clamp((0.65 * af + 0.35) * excursionBoost, 0.3, 12.0);
    double effectiveHours = (double)input->powerOnHours * sustainedFactor;

    double dailyTbwGb = 0.0;
    double tbwRemainingYears = -1.0;
    if (input->powerOnHours > 0 && isfinite(input->totalTbWritten) && input->totalTbWritten > 0.0) {
        double daysActive = (double)input->powerOnHours / 24.0;
        if (daysActive < 0.05) daysActive = 0.05;
        dailyTbwGb = (input->totalTbWritten * 1000.0) / daysActive;
        if (isfinite(input->ratedTbwLimitTb) && input->ratedTbwLimitTb > 0.0) {
            double remTb = input->ratedTbwLimitTb - input->totalTbWritten;
            if (remTb <= 0.0) {
                tbwRemainingYears = 0.0;
            } else if (dailyTbwGb > 0.001) {
                double remDays = (remTb * 1000.0) / dailyTbwGb;
                tbwRemainingYears = dsp_clamp(remDays / 365.25, 0.0, 99.0);
            }
        }
    }

    double wearPressure = 0.0;
    if (isfinite(input->ratedTbwLimitTb) && input->ratedTbwLimitTb > 0.0 && isfinite(input->totalTbWritten) && input->totalTbWritten > 0.0) {
        wearPressure = dsp_clamp((input->totalTbWritten / input->ratedTbwLimitTb) * 35.0, 0.0, 35.0);
    }

    double thermalComp = dsp_clamp((sustainedFactor - 1.0) * 18.0 + ((curC > 45.0) ? (curC - 45.0) * 1.8 : 0.0), 0.0, 65.0);
    double stressScore = dsp_clamp(thermalComp + wearPressure, 0.0, 100.0);

    uint32_t grade = DSP_GRADE_OPTIMAL;
    const char* summary = "Optimal thermal headroom (Arrhenius AF ~ 1.0x)";
    if (curC >= 65.0 || input->criticalTempTimeMin >= 15 || stressScore >= 75.0) {
        grade = DSP_GRADE_CRITICAL;
        summary = "Critical thermal acceleration or TBW endurance saturation";
    } else if (curC >= 55.0 || input->warningTempTimeMin >= 60 || stressScore >= 50.0) {
        grade = DSP_GRADE_HIGH;
        summary = "High sustained thermal stress accelerating cell/lubricant aging";
    } else if (curC >= 46.0 || stressScore >= 25.0) {
        grade = DSP_GRADE_MODERATE;
        summary = "Moderate thermal load; verify chassis airflow under sustained I/O";
    } else if (stressScore >= 10.0) {
        grade = DSP_GRADE_LOW;
        summary = "Acceptable thermal aging factor";
    }

    outReport->arrheniusAccelerationFactor = af;
    outReport->sustainedThermalStressFactor = sustainedFactor;
    outReport->effectiveAgedHours = effectiveHours;
    outReport->dailyTbwRateGb = dailyTbwGb;
    outReport->estimatedTbwRemainingYears = tbwRemainingYears;
    outReport->thermalStressScore = stressScore;
    outReport->thermalGradeCode = grade;
    dsp_safe_strncpy(outReport->thermalSummary, summary, sizeof(outReport->thermalSummary));

    return true;
}

// ---------------------------------------------------------------------------
// Export 5: S.M.A.R.T. History OLS Linear Degradation Regressor
// ---------------------------------------------------------------------------

DSP_API bool DSP_CALL DSP_ProjectSmartDegradationTrend(
    const DSPSmartHistoryPoint* points,
    uint32_t pointCount,
    double warningThreshold,
    double criticalThreshold,
    uint32_t lowerIsWorse,
    DSPSmartTrendProjection* outProjection
) {
    if (!outProjection) return false;
    if (!points && pointCount > 0) return false;
    memset(outProjection, 0, sizeof(DSPSmartTrendProjection));
    outProjection->projectedDaysToWarning = -1.0;
    outProjection->projectedDaysToCritical = -1.0;

    if (pointCount == 0) return true;

    // Filter finite values and find min/max timestamp
    uint32_t validN = 0;
    int64_t minTs = 0;
    int64_t maxTs = 0;
    int64_t latestTs = 0;
    double latestVal = 0.0;

    for (uint32_t i = 0; i < pointCount; ++i) {
        if (!isfinite(points[i].value)) continue;
        if (validN == 0) {
            minTs = maxTs = latestTs = points[i].timestampSec;
            latestVal = points[i].value;
        } else {
            if (points[i].timestampSec < minTs) minTs = points[i].timestampSec;
            if (points[i].timestampSec > maxTs) maxTs = points[i].timestampSec;
            if (points[i].timestampSec >= latestTs) {
                latestTs = points[i].timestampSec;
                latestVal = points[i].value;
            }
        }
        validN++;
    }

    outProjection->validPointCount = validN;
    outProjection->latestValue = latestVal;
    if (validN == 0) return true;

    double spanDays = (double)(maxTs - minTs) / 86400.0;
    if (spanDays < 0.0) spanDays = 0.0;
    outProjection->observationSpanDays = spanDays;

    if (validN < 2 || maxTs == minTs) {
        outProjection->interceptValue = latestVal;
        outProjection->projectedValue30d = latestVal;
        outProjection->trendDirection = DSP_TREND_STABLE;
        return true;
    }

    // Centered OLS Pass 1: means
    double meanX = 0.0;
    double meanY = 0.0;
    for (uint32_t i = 0; i < pointCount; ++i) {
        if (!isfinite(points[i].value)) continue;
        double x = (double)(points[i].timestampSec - minTs) / 86400.0;
        meanX += x;
        meanY += points[i].value;
    }
    meanX /= (double)validN;
    meanY /= (double)validN;

    // Centered OLS Pass 2: covariance & variances
    double sxx = 0.0;
    double syy = 0.0;
    double sxy = 0.0;
    for (uint32_t i = 0; i < pointCount; ++i) {
        if (!isfinite(points[i].value)) continue;
        double dx = ((double)(points[i].timestampSec - minTs) / 86400.0) - meanX;
        double dy = points[i].value - meanY;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }

    double slope = (sxx > 1e-12) ? (sxy / sxx) : 0.0;
    double intercept = meanY - slope * meanX;
    double r2 = 0.0;
    if (sxx > 1e-12 && syy > 1e-12) {
        r2 = dsp_clamp((sxy * sxy) / (sxx * syy), 0.0, 1.0);
    } else if (sxx > 1e-12) {
        r2 = 0.0; // Constant Y series
    }

    double latestX = (double)(latestTs - minTs) / 86400.0;
    double proj30 = latestVal + slope * 30.0;

    uint32_t dir = DSP_TREND_STABLE;
    const double epsSlope = 1e-6;
    if (lowerIsWorse) {
        if (slope < -epsSlope) dir = DSP_TREND_DEGRADING;
        else if (slope > epsSlope) dir = DSP_TREND_IMPROVING;
    } else {
        if (slope > epsSlope) dir = DSP_TREND_DEGRADING;
        else if (slope < -epsSlope) dir = DSP_TREND_IMPROVING;
    }

    auto computeDaysToThreshold = [&](double threshold) -> double {
        if (!isfinite(threshold) || threshold < 0.0) return -1.0;
        if (lowerIsWorse) {
            if (latestVal <= threshold) return 0.0;
            if (slope >= -epsSlope) return -1.0;
            double d = (latestVal - threshold) / (-slope);
            return (d > 36500.0) ? 36500.0 : d;
        } else {
            if (latestVal >= threshold) return 0.0;
            if (slope <= epsSlope) return -1.0;
            double d = (threshold - latestVal) / slope;
            return (d > 36500.0) ? 36500.0 : d;
        }
    };

    outProjection->slopePerDay = slope;
    outProjection->interceptValue = intercept + slope * 0.0;
    (void)latestX;
    outProjection->rSquared = r2;
    outProjection->projectedValue30d = proj30;
    outProjection->trendDirection = dir;
    outProjection->isStatisticallySignificant = (validN >= 3 && r2 >= 0.35 && fabs(slope) > epsSlope) ? 1U : 0U;
    outProjection->projectedDaysToWarning = computeDaysToThreshold(warningThreshold);
    outProjection->projectedDaysToCritical = computeDaysToThreshold(criticalThreshold);

    return true;
}
