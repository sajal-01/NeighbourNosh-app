import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Brand } from "@/constants/theme";
import ScreenHeader from "@/components/screen-header";
import { useTranslation } from "react-i18next";

// ── Chart constants ────────────────────────────────────────────────────────────
// Each bar column is CHART_COL_H tall.  The bottom BAR_RENDER_H pixels are the
// actual bar area; the remaining space at the top holds value labels / tooltip.
const CHART_COL_H = 220;
const BAR_RENDER_H = 155;
const CHART_MAX_VAL = 3200;

const BAR_DATA = [
  { month: "Feb", value: 1800 },
  { month: "Mar", value: 2100 },
  { month: "Apr", value: 2700 },
  { month: "May", value: 3100 },
  { month: "Jun", value: 2200 },
  { month: "Jul", value: 2800 },
];

const CONTRIBUTORS = [
  {
    id: "1",
    name: "A2B Restaurant",
    initials: "A2B",
    bgColor: Brand.main,
    isTop: true,
    meals: "Supplied 450 meals",
  },
  {
    id: "2",
    name: "Empire Grill",
    initials: "EG",
    bgColor: "#8B5E3C",
    isTop: false,
    meals: "Supplied 320 meals",
  },
  {
    id: "3",
    name: "Spice Hub",
    initials: "SH",
    bgColor: "#E07020",
    isTop: false,
    meals: "Supplied 280 meals",
  },

  {
    id: "4",
    name: "Biryani House",
    initials: "BH",
    bgColor: "#FFA07A",
    isTop: false,
    meals: "Supplied 200 meals",
  },
];

const VOLUNTEERS = [
  {
    id: "1",
    name: "John Doe",
    initials: "JD",
    bgColor: "#8B5E3C",
    isTop: true,
    meals: "Supplied 286 meals",
  },
  {
    id: "2",
    name: "Jane Smith",
    initials: "JS",
    bgColor: "#E07020",
    isTop: false,
    meals: "Supplied 150 meals",
  },
  {
    id: "3",
    name: "Rachel",
    initials: "R",
    bgColor: "#FCB07A",
    isTop: false,
    meals: "Supplied 90 meals",
  },
  {
    id: "4",
    name: "Rahul Gowda",
    initials: "RG",
    bgColor: "#E07020",
    isTop: false,
    meals: "Supplied 88 meals",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Pixel height of the bar for a given value. */
function barPx(value: number) {
  return Math.round((value / CHART_MAX_VAL) * BAR_RENDER_H);
}

/**
 * Top offset (from top of barsInner) at which the horizontal grid line for a
 * given Y-axis value should be drawn.  Bars are bottom-aligned inside
 * barsInner, so the top of a bar of height `barPx(v)` sits at
 * `CHART_COL_H - barPx(v)`.
 */
function gridTop(value: number) {
  return CHART_COL_H - barPx(value);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReceiverReportsScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"contributors" | "volunteers">(
    "contributors",
  );

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title={t("receiver.reports.screenTitle")} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Card 1: All-Time Impact ───────────────────────────────────────── */}
        <View style={[s.card, s.impactCard]}>
          <Text style={s.impactSubLabel}>All-Time Impact</Text>
          <Text style={s.impactBigNum}>12,500</Text>
          <Text style={s.impactSubText}>Total Meals Rescued</Text>

          <View style={s.divider} />

          <View style={s.statsRow}>
            {/* People Served */}
            <View style={s.statCol}>
              <View style={s.statIconCircle}>
                <Text style={s.statIcon}>👥</Text>
              </View>
              <Text style={s.statNumber}>4,200</Text>
              <Text style={s.statLabel}>People Served</Text>
            </View>

            <View style={s.statSeparator} />

            {/* Est. Value Saved */}
            <View style={s.statCol}>
              <View style={s.statIconCircle}>
                <Text style={s.statIcon}>💰</Text>
              </View>
              <Text style={s.statNumber}>₹4.5L</Text>
              <Text style={s.statLabel}>Est. Value Saved</Text>
            </View>
          </View>
        </View>

        {/* ── Card 2: Bar Chart ─────────────────────────────────────────────── */}
        <View style={s.card}>
          {/* Chart header row */}
          <View style={s.chartHeader}>
            <Text style={s.chartTitle}>Food Intake (Last 6 Months)</Text>
            <Text style={s.mealsDropdown}>Meals</Text>
          </View>

          {/* Y-axis + bars side by side */}
          <View style={s.chartRow}>
            {/* Y-axis labels */}
            <View style={[s.yAxisCol, { height: CHART_COL_H }]}>
              {[3000, 2000, 1000, 0].map((val) => (
                <Text
                  key={val}
                  style={[
                    s.yLabel,
                    {
                      position: "absolute",
                      top: val === 0 ? CHART_COL_H - 11 : gridTop(val) - 6,
                    },
                  ]}
                >
                  {val === 0 ? "0" : `${val / 1000}k`}
                </Text>
              ))}
            </View>

            {/* Bars column (bars + x-axis) */}
            <View style={s.barsWrapper}>
              {/* Bar area with grid lines */}
              <View style={[s.barsInner, { height: CHART_COL_H }]}>
                {/* Horizontal grid lines */}
                {[3000, 2000, 1000].map((val) => (
                  <View key={val} style={[s.gridLine, { top: gridTop(val) }]} />
                ))}
                {/* Bottom baseline */}
                <View style={[s.gridLine, { bottom: 0 }]} />

                {/* Bar columns */}
                {BAR_DATA.map((item, i) => {
                  const bH = barPx(item.value);
                  const isMay = i === 4;
                  const label =
                    item.value >= 1000
                      ? `${(item.value / 1000).toFixed(1)}k`
                      : `${item.value}`;

                  return (
                    <View key={item.month} style={s.barCol}>
                      {/* Tooltip — May only */}
                      {isMay && (
                        <View style={[s.tooltip, { bottom: bH + 24 }]}>
                          <Text style={s.tooltipText}>May: 3,100 Meals</Text>
                        </View>
                      )}

                      {/* Value label above bar */}
                      <Text style={[s.barValueLabel, { bottom: bH + 5 }]}>
                        {label}
                      </Text>

                      {/* The bar itself */}
                      <View
                        style={[
                          s.bar,
                          {
                            height: bH,
                            width: isMay ? 28 : 20,
                            backgroundColor: isMay ? Brand.main : "#7ec8a0",
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>

              {/* X-axis month labels */}
              <View style={s.xAxisRow}>
                {BAR_DATA.map((item, i) => (
                  <Text
                    key={item.month}
                    style={[s.xLabel, i === 4 && s.xLabelActive]}
                  >
                    {item.month}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* ── Card 3: Stakeholder Reports ───────────────────────────────────── */}
        {/*<View style={[s.card, s.stakeCard]}>
          <View style={s.stakeDocCircle}>
            <Text style={s.stakeDocEmoji}>📄</Text>
          </View>

          <View style={s.stakeBody}>
            <Text style={s.stakeTitle}>Stakeholder Reports</Text>
            <Text style={s.stakeSub}>
              Generate a certified summary of your food rescue impact for audits
              and donors.
            </Text>
          </View>

          <TouchableOpacity
            style={s.downloadBtn}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert(
                t("common.featureComingSoon"),
                t("common.featureComingSoon"),
              )
            }
          >
            <Text style={s.downloadBtnText}>{"📄 DOWNLOAD\nPDF REPORT"}</Text>
          </TouchableOpacity>
        </View>*/}

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <View style={s.tabsRow}>
          {(["contributors", "volunteers"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[s.tab, activeTab === tab && s.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab content ───────────────────────────────────────────────────── */}
        {activeTab === "contributors" ? (
          <View style={s.listCard}>
            {CONTRIBUTORS.map((item, i) => (
              <View key={item.id}>
                {item.isTop && (
                  <View style={s.topBadgeRow}>
                    <View style={s.topBadge}>
                      <Text style={s.topBadgeText}>⭐ Top Contributor</Text>
                    </View>
                  </View>
                )}
                <View
                  style={[
                    s.contributorRow,
                    i < CONTRIBUTORS.length - 1 && s.rowBorder,
                  ]}
                >
                  <View
                    style={[s.avatarCircle, { backgroundColor: item.bgColor }]}
                  >
                    <Text style={s.avatarText}>{item.initials}</Text>
                  </View>

                  <View style={s.contributorInfo}>
                    <Text style={s.contributorName}>{item.name}</Text>
                    <Text style={s.contributorSub}>Consistent donor</Text>
                  </View>

                  <Text style={s.contributorMeals}>{item.meals}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          // <View style={s.emptyState}>
          //   <Text style={s.emptyStateText}>No volunteers data yet</Text>
          // </View>
          <View style={s.listCard}>
            {VOLUNTEERS.map((item, i) => (
              <View key={item.id}>
                {item.isTop && (
                  <View style={s.topBadgeRow}>
                    <View style={s.topBadge}>
                      <Text style={s.topBadgeText}>⭐ Top Volunteer</Text>
                    </View>
                  </View>
                )}
                <View
                  style={[
                    s.contributorRow,
                    i < VOLUNTEERS.length - 1 && s.rowBorder,
                  ]}
                >
                  <View
                    style={[s.avatarCircle, { backgroundColor: item.bgColor }]}
                  >
                    <Text style={s.avatarText}>{item.initials}</Text>
                  </View>

                  <View style={s.contributorInfo}>
                    <Text style={s.contributorName}>{item.name}</Text>
                    <Text style={s.contributorSub}>Consistent volunteer</Text>
                  </View>

                  <Text style={s.contributorMeals}>{item.meals}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const SHADOW = {
  elevation: 3,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
} as const;

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F4FBF7",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f2419",
  },
  bellWrap: {
    position: "relative",
    padding: 4,
  },
  bellBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e53e3e",
    borderWidth: 1.5,
    borderColor: "#F4FBF7",
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14,
  },

  // ── Card base ──────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    ...SHADOW,
  },

  // ── Card 1: All-Time Impact ─────────────────────────────────────────────────
  impactCard: {
    borderWidth: 1.5,
    borderColor: "#c5e8d0",
    alignItems: "center",
  },
  impactSubLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 6,
  },
  impactBigNum: {
    fontSize: 42,
    fontWeight: "800",
    color: Brand.main,
    lineHeight: 52,
  },
  impactSubText: {
    fontSize: 13,
    color: "#888",
    marginBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: "#e8f5ee",
    alignSelf: "stretch",
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e6f4ec",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statIcon: {
    fontSize: 19,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f2419",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
  },
  statSeparator: {
    width: 1,
    height: 60,
    backgroundColor: "#e8f5ee",
  },

  // ── Card 2: Bar Chart ───────────────────────────────────────────────────────
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f2419",
  },
  mealsDropdown: {
    fontSize: 13,
    color: Brand.main,
    fontWeight: "600",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  yAxisCol: {
    width: 26,
    position: "relative",
  },
  yLabel: {
    fontSize: 9,
    color: "#bbb",
    right: 2,
    textAlign: "right",
    width: 24,
  },
  barsWrapper: {
    flex: 1,
  },
  barsInner: {
    flexDirection: "row",
    alignItems: "flex-end",
    position: "relative",
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#edf7f1",
  },
  barCol: {
    flex: 1,
    height: CHART_COL_H,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  bar: {
    borderRadius: 4,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  barValueLabel: {
    position: "absolute",
    fontSize: 9,
    color: "#555",
    fontWeight: "600",
    textAlign: "center",
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "#0f2419",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    zIndex: 10,
    // Center horizontally — wider than bar, so negative horizontal offset
    left: -12,
    right: -12,
    alignItems: "center",
  },
  tooltipText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
  },
  xAxisRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  xLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: "#aaa",
  },
  xLabelActive: {
    color: Brand.main,
    fontWeight: "700",
  },

  // ── Card 3: Stakeholder Reports ─────────────────────────────────────────────
  stakeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stakeDocCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#e6f4ec",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stakeDocEmoji: {
    fontSize: 22,
  },
  stakeBody: {
    flex: 1,
    gap: 4,
  },
  stakeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f2419",
  },
  stakeSub: {
    fontSize: 11,
    color: "#888",
    lineHeight: 15,
  },
  downloadBtn: {
    backgroundColor: Brand.main,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },

  // ── Tabs ────────────────────────────────────────────────────────────────────
  tabsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: Brand.main,
  },
  tabText: {
    fontSize: 14,
    color: "#aaa",
    fontWeight: "500",
  },
  tabTextActive: {
    color: Brand.main,
    fontWeight: "700",
  },

  // ── Contributors list ────────────────────────────────────────────────────────
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    ...SHADOW,
  },
  topBadgeRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff8e1",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#ffe082",
  },
  topBadgeText: {
    fontSize: 11,
    color: "#b8860b",
    fontWeight: "600",
  },
  contributorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f2f2f2",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  contributorInfo: {
    flex: 1,
    gap: 2,
  },
  contributorName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f2419",
  },
  contributorSub: {
    fontSize: 12,
    color: "#aaa",
  },
  contributorMeals: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
    flexShrink: 0,
    textAlign: "right",
  },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyState: {
    paddingVertical: 36,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 14,
    color: "#bbb",
  },
});
