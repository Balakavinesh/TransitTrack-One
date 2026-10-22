import { query } from "../db/connection.js";
import { StationService } from "./stationService.js";
import { JourneyService } from "./journeyService.js";
import { EvidenceService } from "./evidenceService.js";
import { config } from "../config/index.js";

export interface AssistantResponse {
  text: string;
  to?: string;
  label?: string;
  toolsCalled: string[];
  isFallback: boolean;
}

export class AssistantService {
  /**
   * Process passenger message in Tamil or English
   */
  public static async answer(input: string, language: string = "en", sessionId?: string): Promise<AssistantResponse> {
    const isTamil = language === "ta" || /[\u0B80-\u0BFF]/.test(input);
    const textLower = input.toLowerCase();
    const toolsCalled: string[] = [];

    let replyText = "";
    let actionTo: string | undefined;
    let actionLabel: string | undefined;

    // Intent 1: Station Lift & Accessibility Evidence
    if (/lift|elevator|step-free|accessibility|ramp|லிஃப்ட்|படிக்கட்டு/i.test(input)) {
      toolsCalled.push("get_station_detail");

      // Extract station name if mentioned
      let targetStation = "guindy";
      if (/central|சென்ட்ரல்/i.test(input)) targetStation = "central";
      else if (/airport|விமான/i.test(input)) targetStation = "airport";
      else if (/tambaram|தாம்பரம்/i.test(input)) targetStation = "tambaram";
      else if (/alandur|ஆலந்தூர்/i.test(input)) targetStation = "alandur";

      const station = await StationService.getStationDetail(targetStation);

      if (station) {
        const tamilNames: Record<string, string> = {
          guindy: "கிண்டி",
          central: "சென்னை சென்ட்ரல்",
          airport: "சென்னை விமான நிலையம்",
          tambaram: "தாம்பரம்",
          alandur: "ஆலந்தூர்",
          egmore: "எழும்பூர்",
          koyambedu: "கோயம்பேடு",
          thiruvanmiyur: "திருவான்மியூர்",
          saidapet: "சைதாப்பேட்டை",
          "t-nagar": "தி. நகர்",
        };
        const displayName = isTamil ? (tamilNames[station.id] || station.name) : station.name;

        if (isTamil) {
          if (station.lift === "Verified") {
            replyText = `${displayName} நிலையத்தில் லிஃப்ட் வசதி உறுதி செய்யப்பட்டுள்ளது (Verified). வீல்சேரில் பயணம் செய்பவர்களுக்கு உகந்தது.`;
          } else if (station.lift === "Uncertain") {
            replyText = `${displayName} நிலையத்தின் லிஃப்ட் தகவல் உறுதியற்றது (Uncertain). பயணத்திற்கு முன் நிலையத்தில் சரிபார்க்கவும்.`;
          } else {
            replyText = `${displayName} நிலையத்தின் லிஃப்ட் வசதி குறித்த உறுதிப்படுத்தப்பட்ட தரவு கிடைக்கவில்லை (Unknown).`;
          }
          actionTo = `/app/access?station=${station.id}`;
          actionLabel = "நிலையங்களைப் பார்க்க";
        } else {
          if (station.lift === "Verified") {
            replyText = `The lift at ${station.name} is verified operational based on official station records and corroborating reports.`;
          } else if (station.lift === "Uncertain") {
            replyText = `The lift at ${station.name} has uncertain evidence status. Community observations indicate a potential outage, so step-free access cannot be confirmed.`;
          } else {
            replyText = `The lift availability at ${station.name} is currently unknown in the dataset. Do not assume step-free access without confirming on site.`;
          }
          actionTo = `/app/access?station=${station.id}`;
          actionLabel = "Explore station evidence";
        }
      }
    }

    // Intent 2: Journey Planning (Tambaram to Guindy, Airport to Central, etc.)
    else if (/route|journey|travel|tambaram|guindy|airport|central|பயணம்|வழி/i.test(input)) {
      toolsCalled.push("plan_journey");

      let origin = "Chennai Airport";
      let dest = "Chennai Central";
      let isStairsOption = /fewer stairs|low walk|stairs|குறைவான படிக்கட்டு/i.test(input);

      if (/tambaram/i.test(input) && /guindy/i.test(input)) {
        origin = "Tambaram";
        dest = "Guindy";
      }

      const plan = await JourneyService.planJourney({
        origin,
        destination: dest,
        profile: isStairsOption ? "Wheelchair users" : "Standard",
      });

      const best = plan.journeys[0];
      if (best) {
        if (isTamil) {
          replyText = `${origin} முதல் ${dest} வரை பயணம்: ${best.minutes} நிமிடங்கள், ${best.transfers} இடமாற்றங்கள். ஆதாரம்: ${best.evidence}.`;
          actionTo = `/app/planner?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
          actionLabel = "மாதிரி வழியைப் பார்க்க";
        } else {
          replyText = `Recommended journey from ${origin} to ${dest}: approx ${best.minutes} min (${best.transfers} transfer(s), ₹${best.fare}). Overall evidence quality: ${best.evidence}.`;
          actionTo = `/app/planner?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
          actionLabel = "Compare journeys in planner";
        }
      } else {
        replyText = isTamil
          ? "தேர்ந்தெடுக்கப்பட்ட இடங்களுக்கு இடையே நேரடி அல்லது அனுமதிக்கப்பட்ட பாதை கிடைக்கவில்லை."
          : `No supported transit connection found between ${origin} and ${dest} under current constraints.`;
        actionTo = "/app/planner";
        actionLabel = isTamil ? "பயணத் திட்டம்" : "Open planner";
      }
    }

    // Intent 3: Timetable Uncertainty & Data Quality
    else if (/uncertain|timetable|quality|trust|நம்பகத்தன்மை|நேரம்/i.test(input)) {
      toolsCalled.push("get_evidence_summary");
      if (isTamil) {
        replyText = "“உறுதியற்றது” (Uncertain) என்பது மாதிரி அட்டவணையில் முழுமையான ஆதாரம் இல்லை என்பதை குறிக்கிறது. இது ரயில் தாமதத்திற்கான கணிப்பு அல்ல, தகவல் தரத்தின் மதிப்பீடு மட்டுமே.";
        actionTo = "/app/trust";
        actionLabel = "தரவு நம்பகத்தன்மை";
      } else {
        replyText = "“Uncertain” denotes incomplete or conflicting information in the data sources. It measures data evidence quality, not operational punctuality or travel delay.";
        actionTo = "/app/trust";
        actionLabel = "Understand data quality";
      }
    }

    // Default Fallback
    else {
      if (isTamil) {
        replyText = "நான் சென்னை டிரான்சிட் டிராக் உதவியாளர். தாம்பரம்–கிண்டி பயணம், மெட்ரோ லிஃப்ட் நிலவரம் அல்லது தரவு நம்பகத்தன்மை பற்றி கேட்கலாம்.";
        actionTo = "/app/about";
        actionLabel = "விளக்கத்தைப் பார்க்க";
      } else {
        replyText = "I am the TransitTrack mobility assistant. Ask about journeys (e.g. Tambaram to Guindy), station elevator status, or data evidence bands.";
        actionTo = "/app/about";
        actionLabel = "Learn about the platform";
      }
    }

    // Record interaction in assistant_interactions table
    await query(`
      INSERT INTO assistant_interactions (id, session_id, language, prompt, response_text, action_to, action_label, tools_called, is_fallback)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      `INT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId || "default-session",
      language,
      input,
      replyText,
      actionTo || null,
      actionLabel || null,
      JSON.stringify(toolsCalled),
      true,
    ]);

    return {
      text: replyText,
      to: actionTo,
      label: actionLabel,
      toolsCalled,
      isFallback: true,
    };
  }
}
