/* ============================================================
   KIA Admission Data Form — behaviour
   - Builds the step rail from the panels found in the DOM
   - Validates each section before letting the student continue
   - Keeps form values in memory until submission to Supabase
   - Repeatable "Achievement" cards
  - On submit: stores a pending application, then downloads a PDF.
   ============================================================ */
(function () {
  "use strict";

  const form = document.getElementById("admissionForm");
  const allPanels = Array.from(form.querySelectorAll(".panel"));
  const hostelPanel = document.getElementById("hostelPanel");
  const hostelStatus = document.getElementById("hostelStatus");
  let panels = [];
  let railItems = [];
  const railList = document.getElementById("railList");
  const progressFill = document.getElementById("progressFill");
  const progressPercent = document.getElementById("progressPercent");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");
  const sectionStatus = document.getElementById("sectionStatus");
  const saveIndicator = document.getElementById("saveIndicator");
  const reviewSummary = document.getElementById("reviewSummary");
  const successOverlay = document.getElementById("successOverlay");
  const downloadSubmittedPdfBtn = document.getElementById("downloadSubmittedPdf");
  const backToEditBtn = document.getElementById("backToEditBtn");
  const reviewSubmitBtn = document.getElementById("reviewSubmitBtn");
  const landingView = document.getElementById("landingView");
  const entryChoiceView = document.getElementById("entryChoiceView");
  const staffGateView = document.getElementById("staffGateView");
  const staffGateForm = document.getElementById("staffGateForm");
  const staffEmailInput = document.getElementById("staffEmail");
  const staffPasswordInput = document.getElementById("staffPassword");
  const staffConfirmPasswordInput = document.getElementById("staffConfirmPassword");
  const staffConfirmPasswordGroup = document.getElementById("staffConfirmPasswordGroup");
  const staffAuthModeBtn = document.getElementById("staffAuthModeBtn");
  const staffAuthSubmitBtn = document.getElementById("staffAuthSubmitBtn");
  const staffAuthDescription = document.getElementById("staffAuthDescription");
  const staffGateError = document.getElementById("staffGateError");
  const studentFormView = document.getElementById("studentFormView");
  const staffDashboardView = document.getElementById("staffDashboardView");
  const staffReviewBar = document.getElementById("staffReviewBar");
  const staffFormBackBtn = document.getElementById("staffFormBackBtn");
  const staffReviewIdentity = document.getElementById("staffReviewIdentity");
  const applicationsTableBody = document.getElementById("applicationsTableBody");
  const dashboardEmpty = document.getElementById("dashboardEmpty");
  const applicationSearch = document.getElementById("applicationSearch");
  let appMode = "student";
  let currentStaffApplicationId = "";
  let dashboardStatus = "Pending Review";
  let dashboardApplications = [];
  let currentStaffEmail = "";
  let lastSubmittedApplication = null;
  let staffAuthMode = "signup";
  const TEST_STAFF_EMAIL = "swathi.24cs@kct.ac.in";

  function isAllowedStaffEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    return /@kia\.ac\.in$/.test(normalizedEmail) || normalizedEmail === TEST_STAFF_EMAIL;
  }

  const SECTION_LABELS = {
    identity: "Identity",
    admission: "Admission",
    contact: "Contact",
    xedu: "Class X education",
    xiiedu: "Class XII education",
    xiimarks: "XII subject marks",
    family: "Family",
    social: "School & social background",
    agri: "Agricultural background",
    bank: "Official / bank information",
    achievements: "Achievements",
    hostel: "Hostel Admission",
    review: "Review & submit"
  };

  let currentIndex = 0;
  const hostelPrefillState = { initialized: false };

  function renderRail() {
    panels = allPanels.filter((panel) => !panel.hidden);
    if (!panels.length) return;
    if (currentIndex < 0 || currentIndex >= panels.length) currentIndex = 0;

    railList.innerHTML = "";
    panels.forEach((panel, i) => {
      const key = panel.dataset.section;
      const li = document.createElement("li");
      li.className = "rail__item";
      li.dataset.index = i;
      li.innerHTML = `<span class="rail__dot"></span><span>${SECTION_LABELS[key] || key}</span><span class="rail__check">&#10003;</span>`;
      li.addEventListener("click", () => goTo(i, true));
      railList.appendChild(li);
    });
    railItems = Array.from(railList.children);
    panels.forEach((panel) => panel.classList.remove("is-active"));
    railItems.forEach((item) => item.classList.remove("is-active"));
    panels[currentIndex].classList.add("is-active");
    railItems[currentIndex].classList.add("is-active");
    prevBtn.disabled = currentIndex === 0;
    const isLast = currentIndex === panels.length - 1;
    nextBtn.hidden = isLast;
    submitBtn.hidden = true;
    sectionStatus.textContent = `Step ${currentIndex + 1} of ${panels.length}`;
    if (isLast) renderReview();
    updateProgress();
  }

  /* ---------------- Navigation ---------------- */
  function goTo(index, fromRailClick) {
    if (index < 0 || index >= panels.length) return;
    if (fromRailClick && index > currentIndex && !validateSection(currentIndex)) return;

    panels[currentIndex].classList.remove("is-active");
    railItems[currentIndex].classList.remove("is-active");
    currentIndex = index;
    panels[currentIndex].classList.add("is-active");
    railItems[currentIndex].classList.add("is-active");

    prevBtn.disabled = currentIndex === 0;
    const isLast = currentIndex === panels.length - 1;
    nextBtn.hidden = isLast;
    submitBtn.hidden = true;
    sectionStatus.textContent = `Step ${currentIndex + 1} of ${panels.length}`;

    if (isLast) renderReview();

    updateProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  prevBtn.addEventListener("click", () => goTo(currentIndex - 1));
  nextBtn.addEventListener("click", () => {
    if (validateSection(currentIndex)) {
      markComplete(currentIndex);
      goTo(currentIndex + 1);
    }
  });

  function markComplete(index) {
    if (validateSection(index, true)) {
      railItems[index].classList.add("is-complete");
    } else {
      railItems[index].classList.remove("is-complete");
    }
  }

  function updateProgress() {
    const total = panels.length;
    const complete = railItems.filter((it) => it.classList.contains("is-complete")).length;
    const pct = Math.round((complete / total) * 100);
    progressFill.style.width = pct + "%";
    progressPercent.textContent = pct;
  }

  /* ---------------- Validation ---------------- */
  function validateSection(index, silent) {
    const panel = panels[index];
    if (!panel || panel.hidden) return true;
    const inputs = Array.from(panel.querySelectorAll("input[required], select[required]"));
    let ok = true;
    inputs.forEach((input) => {
      const field = input.closest(".field") || input.closest(".checkbox");
      const valid = input.checkValidity();
      if (!valid) ok = false;
      if (!silent && field) {
        field.classList.toggle("has-error", !valid);
        if (!valid && !field.querySelector(".field__error")) {
          const err = document.createElement("p");
          err.className = "field__error";
          err.textContent = input.validationMessage || "This field is required.";
          field.appendChild(err);
        } else if (!valid) {
          field.querySelector(".field__error").textContent = input.validationMessage || "This field is required.";
        }
      }
    });
    if (!silent && !ok) {
      const firstInvalid = panel.querySelector(":invalid");
      if (firstInvalid) firstInvalid.focus({ preventScroll: false });
    }
    return ok;
  }

  form.addEventListener("input", (e) => {
    const field = e.target.closest(".field");
    if (field && field.classList.contains("has-error") && e.target.checkValidity()) {
      field.classList.remove("has-error");
    }
    saveDraft();
  });

  function prefillHostelForm() {
    if (hostelPrefillState.initialized) return;

    const data = collectData();
    const prefillMap = {
      hostelName: data.studentName || "",
      hostelCourse: data.course || "",
      hostelParentName: [data.fatherName, data.motherName].filter(Boolean).join(" / "),
      hostelDob: data.dob || "",
      hostelBloodGroup: data.bloodGroup === "Other" ? (data.bloodGroupOther || "") : (data.bloodGroup || ""),
      hostelEmail: data.email || "",
      hostelMobile: data.studentMobile || "",
      hostelAddress: data.commAddress || "",
      hostelCorrespondencePhone: data.whatsapp || "",
      hostelPermanentAddress: data.permAddress || "",
      hostelFatherOccupation: data.fatherOccupation || "",
      hostelMotherOccupation: data.motherOccupation || "",
      hostelEmergencyName: data.fatherName || data.motherName || "",
      hostelEmergencyResidencePhone: data.emergency1 || "",
      hostelEmergencyOfficePhone: data.emergency2 || ""
    };

    Object.entries(prefillMap).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.value === "" || el.value === null || el.value === undefined) {
        el.value = value;
      }
    });

    hostelPrefillState.initialized = true;
  }

  function syncHostelStep() {
    const selected = hostelStatus ? hostelStatus.value : "";
    const showHostel = selected === "Yes";
    if (hostelPanel) hostelPanel.hidden = !showHostel;
    if (showHostel) prefillHostelForm();
    renderRail();
    if (hostelPanel && !hostelPanel.hidden && currentIndex === panels.length - 1 && panels[currentIndex].dataset.section === "review") {
      goTo(panels.findIndex((panel) => panel.dataset.section === "hostel"), false);
    }
  }

  /* ---------------- Achievements (repeatable) ---------------- */
  const achievementsList = document.getElementById("achievementsList");
  const addAchievementBtn = document.getElementById("addAchievement");
  let achievementCount = 0;

  function addAchievement(data) {
    achievementCount += 1;
    const n = achievementCount;
    const card = document.createElement("div");
    card.className = "achievement-card";
    card.dataset.achievement = n;
    card.innerHTML = `
      <div class="achievement-card__head">
        <span>Achievement ${n}</span>
        <button type="button" class="achievement-remove" aria-label="Remove achievement">Remove</button>
      </div>
      <div class="grid">
        <div class="field">
          <label>Category</label>
          <select name="achCategory_${n}">
            <option value="" selected>Select</option>
            <option>Academic</option>
            <option>Sports</option>
            <option>Cultural</option>
            <option>Co-curricular</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label>Activity</label>
          <input type="text" name="achActivity_${n}" placeholder="e.g. State Kabaddi Championship">
        </div>
        <div class="field">
          <label>Achievement level</label>
          <select name="achLevel_${n}">
            <option value="" selected>Select</option>
            <option>School</option>
            <option>District</option>
            <option>State</option>
            <option>National</option>
            <option>International</option>
          </select>
        </div>
        <div class="field">
          <label>Achievement type</label>
          <select name="achType_${n}">
            <option value="" selected>Select</option>
            <option>Winner</option>
            <option>Runner-up</option>
            <option>Participation</option>
            <option>Certification</option>
          </select>
        </div>
        <div class="field field--wide">
          <label>Description</label>
          <textarea name="achDescription_${n}" rows="2"></textarea>
        </div>
      </div>`;
    achievementsList.appendChild(card);
    card.querySelector(".achievement-remove").addEventListener("click", () => {
      card.remove();
      saveDraft();
    });
    if (data) {
      Object.entries(data).forEach(([k, v]) => {
        const el = card.querySelector(`[name="${k}_${n}"]`);
        if (el) el.value = v;
      });
    }
  }
  addAchievementBtn.addEventListener("click", () => addAchievement());

  /* ---------------- Hostel visitors ---------------- */
  const hostelVisitorsList = document.getElementById("hostelVisitorsList");

  function addHostelVisitor(data) {
    const visitorCount = hostelVisitorsList.children.length + 1;
    if (visitorCount > 3) return;
    const card = document.createElement("div");
    card.className = "achievement-card";
    card.innerHTML = `
      <div class="achievement-card__head">
        <span>Relative / Visitor ${visitorCount}</span>
      </div>
      <div class="grid">
        <div class="field">
          <label>Name</label>
          <input type="text" name="hostelVisitorName_${visitorCount}" pattern="[A-Za-z\s]+" title="Only alphabets are allowed">
        </div>
        <div class="field">
          <label>Address</label>
          <textarea name="hostelVisitorAddress_${visitorCount}" rows="2"></textarea>
        </div>
        <div class="field">
          <label>Phone Number</label>
          <input type="tel" name="hostelVisitorPhone_${visitorCount}" pattern="[0-9]{10}" maxlength="10" inputmode="numeric">
        </div>
        <div class="field">
          <label>Relationship with Student</label>
          <input type="text" name="hostelVisitorRelation_${visitorCount}">
        </div>
      </div>`;
    hostelVisitorsList.appendChild(card);

    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        const el = card.querySelector(`[name="${key}_${visitorCount}"]`);
        if (el) el.value = value;
      });
    }
  }

  for (let i = 1; i <= 3; i += 1) {
    addHostelVisitor();
  }

  /* ---------------- Input filters (digits-only mobiles, alphabet-only names) ---------------- */
  const MOBILE_FIELD_IDS = ["studentMobile", "whatsapp", "emergency1", "emergency2", "fatherMobile", "motherMobile", "hostelMobile", "hostelCorrespondencePhone", "hostelPermanentPhone", "hostelLocalGuardianPhone", "hostelEmergencyResidencePhone", "hostelEmergencyOfficePhone"]; 
  const NAME_FIELD_IDS = ["studentName", "fatherName", "motherName", "bankHolder", "hostelName", "hostelParentName", "hostelLocalGuardianName", "hostelEmergencyName"];

  MOBILE_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      el.value = el.value.replace(/\D/g, "").slice(0, 10);
    });
  });

  NAME_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      el.value = el.value.replace(/[^A-Za-z\s]/g, "");
    });
  });

  /* ---------------- "Same as" copy helpers ---------------- */
  function wireCopyField(checkboxId, sourceEls, targetEl) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox || !targetEl) return;
    const sync = () => {
      if (checkbox.checked) {
        targetEl.value = sourceEls.map((el) => (el ? el.value : "")).join(", ").replace(/^,\s*|,\s*$/g, "");
        targetEl.readOnly = true;
      } else {
        targetEl.readOnly = false;
      }
      saveDraft();
    };
    checkbox.addEventListener("change", sync);
    sourceEls.forEach((el) => {
      if (el) el.addEventListener("input", () => { if (checkbox.checked) sync(); });
    });
  }

  wireCopyField("sameAsMobile", [form.elements.studentMobile], form.elements.whatsapp);
  wireCopyField("sameAsCommAddress", [form.elements.commAddress], form.elements.permAddress);

  // Toggle "Other" input field for blood group
  const bloodGroupSelect = document.getElementById("bloodGroup");
  const bloodGroupOtherField = document.getElementById("bloodGroupOtherField");
  if (bloodGroupSelect && bloodGroupOtherField) {
    bloodGroupSelect.addEventListener("change", () => {
      if (bloodGroupSelect.value === "Other") {
        bloodGroupOtherField.style.display = "block";
        document.getElementById("bloodGroupOther").required = true;
      } else {
        bloodGroupOtherField.style.display = "none";
        document.getElementById("bloodGroupOther").required = false;
        document.getElementById("bloodGroupOther").value = "";
      }
      saveDraft();
    });
  }

  // Toggle "Other" input field for community
  const communitySelect = document.getElementById("community");
  const communityOtherField = document.getElementById("communityOtherField");
  if (communitySelect && communityOtherField) {
    communitySelect.addEventListener("change", () => {
      if (communitySelect.value === "Other") {
        communityOtherField.style.display = "block";
        document.getElementById("communityOther").required = true;
      } else {
        communityOtherField.style.display = "none";
        document.getElementById("communityOther").required = false;
        document.getElementById("communityOther").value = "";
      }
      saveDraft();
    });
  }

  // "Same as Class X" copies several fields at once into their XII counterparts
  (function wireSameAsX() {
    const checkbox = document.getElementById("sameAsX");
    if (!checkbox) return;
    const pairs = [
      [form.elements.xBoard, form.elements.xiiBoard],
      [form.elements.xSchool, form.elements.xiiSchool],
      [form.elements.xSchoolAddress, form.elements.xiiSchoolAddress],
      [form.elements.xMedium, form.elements.xiiMedium]
    ];
    const sync = () => {
      pairs.forEach(([source, target]) => {
        if (!source || !target) return;
        if (checkbox.checked) {
          target.value = source.value;
          target.readOnly = true;
        } else {
          target.readOnly = false;
        }
      });
      saveDraft();
    };
    checkbox.addEventListener("change", sync);
    pairs.forEach(([source]) => {
      if (source) source.addEventListener("input", () => { if (checkbox.checked) sync(); });
    });
  })();

  /* ---------------- Submission-only storage ---------------- */
  function saveDraft() {
    saveIndicator.textContent = "Not saved until submission";
  }

  function loadDraft() {
    // Browser drafts are intentionally disabled. Form submissions and
    // dashboard records are stored and fetched through Supabase only.
  }

  /* ---------------- Data collection ---------------- */
  function collectData() {
    const data = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === "file") return;
      if (el.type === "checkbox") data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  function getHostelDataFromForm(sourceData = null) {
    const data = sourceData || collectData();
    const visitors = [];
    const visitorCards = hostelVisitorsList ? Array.from(hostelVisitorsList.children) : [];

    visitorCards.forEach((card, index) => {
      const entry = {
        name: data[`hostelVisitorName_${index + 1}`] || "",
        address: data[`hostelVisitorAddress_${index + 1}`] || "",
        phone: data[`hostelVisitorPhone_${index + 1}`] || "",
        relationship: data[`hostelVisitorRelation_${index + 1}`] || ""
      };
      visitors.push(entry);
    });

    return {
      rollNumber: data.hostelRollNumber || "",
      applicantName: data.hostelName || "",
      courseBranch: data.hostelCourse || "",
      parentName: data.hostelParentName || "",
      dateOfBirth: data.hostelDob || "",
      bloodGroup: data.hostelBloodGroup || "",
      medicineAllergy: data.hostelMedicineAllergy || "",
      allergyDetails: data.hostelAllergyDetails || "",
      email: data.hostelEmail || "",
      mobile: data.hostelMobile || "",
      address: data.hostelAddress || "",
      correspondencePhone: data.hostelCorrespondencePhone || "",
      permanentAddress: data.hostelPermanentAddress || "",
      permanentPhone: data.hostelPermanentPhone || "",
      localGuardianName: data.hostelLocalGuardianName || "",
      localGuardianAddress: data.hostelLocalGuardianAddress || "",
      localGuardianPhone: data.hostelLocalGuardianPhone || "",
      localGuardianOccupation: data.hostelLocalGuardianOccupation || "",
      fatherOccupation: data.hostelFatherOccupation || "",
      motherOccupation: data.hostelMotherOccupation || "",
      holidayTravel: data.hostelHolidayTravel || "",
      emergencyName: data.hostelEmergencyName || "",
      emergencyResidencePhone: data.hostelEmergencyResidencePhone || "",
      emergencyOfficePhone: data.hostelEmergencyOfficePhone || "",
      emergencyRelationship: data.hostelEmergencyRelation || "",
      visitors,
      roomAllocated: ""
    };
  }

  /* ---------------- Review rendering ---------------- */
  const REVIEW_GROUPS = [
    { title: "Identity", keys: ["studentName", "registerNumber", "dob", "gender", "bloodGroup", "nationality", "religion", "community", "caste", "motherTongue"] },
    { title: "Admission", keys: ["tnauNumber", "admissionType", "admissionQuota", "firstGraduate", "hostelStatus", "course", "batch"] },
    { title: "Contact", keys: ["studentMobile", "whatsapp", "email", "commAddress", "permAddress", "district", "state", "pincode", "emergency1", "emergency2"] },
    { title: "Class X education", keys: ["xBoard", "xSchool", "xSchoolAddress", "xPassing", "xMedium", "xMarks"] },
    { title: "Class XII education", keys: ["xiiBoard", "xiiSchool", "xiiSchoolAddress", "xiiPassing", "xiiMedium", "xiiMarks"] },
    { title: "XII subject marks", keys: ["mLanguage", "mEnglish", "mMaths", "mPhysics", "mChemistry", "mBiology", "mBotany", "mZoology", "mComputerScience", "mTotal", "xiiCutoff", "emisNumber"] },
    { title: "Family", keys: ["fatherName", "fatherQualification", "fatherOccupation", "fatherCompany", "fatherEmail", "fatherMobile", "motherName", "motherQualification", "motherOccupation", "motherCompany", "motherEmail", "motherMobile", "familyIncome"] },
    { title: "School & social background", keys: ["boardOfStudy", "mediumOfStudy", "schoolType", "tamilXii", "familyBackground"] },
    { title: "Agricultural background", keys: ["landAvailability", "landArea", "majorCrops", "landLocality", "residenceType"] },
    { title: "Official / bank information", keys: ["bankHolder", "holderRelationship", "bankName", "bankBranch", "bankAccount", "bankIfsc", "loanAccount", "loanIfsc", "loanBankBranch", "passportNumber", "aadhaarNumber"] }
  ];

  const HOSTEL_REVIEW_FIELDS = [
    "hostelName",
    "hostelCourse",
    "hostelParentName",
    "hostelDob",
    "hostelBloodGroup",
    "hostelMedicineAllergy",
    "hostelAllergyDetails",
    "hostelEmail",
    "hostelMobile",
    "hostelAddress",
    "hostelCorrespondencePhone",
    "hostelPermanentAddress",
    "hostelPermanentPhone",
    "hostelLocalGuardianName",
    "hostelLocalGuardianAddress",
    "hostelLocalGuardianPhone",
    "hostelLocalGuardianOccupation",
    "hostelFatherOccupation",
    "hostelMotherOccupation",
    "hostelHolidayTravel",
    "hostelEmergencyName",
    "hostelEmergencyResidencePhone",
    "hostelEmergencyOfficePhone",
    "hostelEmergencyRelation"
  ];

  const FIELD_LABELS = {};
  form.querySelectorAll("label[for]").forEach((label) => {
    FIELD_LABELS[label.getAttribute("for")] = label.textContent.replace("*", "").trim();
  });
  FIELD_LABELS.registerNumber = FIELD_LABELS.registerNumber || "Registration Number";

  const WIDE_KEYS = new Set(["commAddress", "permAddress", "xSchoolAddress", "xiiSchoolAddress", "majorCrops"]);

  function escapeHtml(value) {
    const container = document.createElement("div");
    container.textContent = value;
    return container.innerHTML;
  }

  function renderReview() {
    const data = collectData();
    reviewSummary.innerHTML = "";

    REVIEW_GROUPS.forEach((group) => {
      const filled = group.keys.filter((k) => data[k]);
      const div = document.createElement("div");
      div.className = "review-group";
      const dl = filled.length
        ? `<dl>${filled.map((k) => `<dt>${FIELD_LABELS[k] || k}</dt><dd>${escapeHtml(String(data[k]))}</dd>`).join("")}</dl>`
        : `<p class="review-empty">No details entered.</p>`;
      div.innerHTML = `<h3>${group.title}</h3>${dl}`;
      reviewSummary.appendChild(div);
    });

    if (hostelStatus && hostelStatus.value === "Yes") {
      const hostelDiv = document.createElement("div");
      hostelDiv.className = "review-group";
      const filled = HOSTEL_REVIEW_FIELDS.filter((k) => data[k] && String(data[k]).trim() !== "");
      const dl = filled.length
        ? `<dl>${filled.map((k) => `<dt>${FIELD_LABELS[k] || k}</dt><dd>${escapeHtml(String(data[k]))}</dd>`).join("")}</dl>`
        : `<p class="review-empty">No hostel details entered.</p>`;
      hostelDiv.innerHTML = `<h3>Hostel Admission</h3>${dl}`;
      reviewSummary.appendChild(hostelDiv);
    }

    // achievements
    const achCards = Array.from(achievementsList.children);
    const achDiv = document.createElement("div");
    achDiv.className = "review-group";
    if (achCards.length === 0) {
      achDiv.innerHTML = `<h3>Achievements</h3><p class="review-empty">None added.</p>`;
    } else {
      const items = achCards.map((card, i) => {
        const n = card.dataset.achievement;
        const activity = data[`achActivity_${n}`] || "Untitled";
        const level = data[`achLevel_${n}`] || "";
        return `<dt>${i + 1}.</dt><dd>${escapeHtml(activity)}${level ? " — " + escapeHtml(level) : ""}</dd>`;
      }).join("");
      achDiv.innerHTML = `<h3>Achievements</h3><dl>${items}</dl>`;
    }
    reviewSummary.appendChild(achDiv);
  }

  function buildAchievementsPayload(data) {
    return Array.from(achievementsList.children).map((card) => {
      const number = card.dataset.achievement;
      return {
        category: data[`achCategory_${number}`] || "",
        activity: data[`achActivity_${number}`] || "",
        level: data[`achLevel_${number}`] || "",
        type: data[`achType_${number}`] || "",
        description: data[`achDescription_${number}`] || ""
      };
    }).filter((achievement) => Object.values(achievement).some(Boolean));
  }

  async function savePendingApplicationToSupabase(formData) {
    if (typeof supabaseClient === "undefined") {
      throw new Error("Supabase is not available. Check supabase-client.js and refresh the page.");
    }

    const { data, error } = await supabaseClient.rpc("submit_pending_admission_with_registration", {
      p_form: formData,
      p_achievements: buildAchievementsPayload(formData)
    });

    if (error) throw error;
    if (!Array.isArray(data) || !data[0]?.application_id || !data[0]?.registration_number) {
      throw new Error("Supabase did not return the application and registration numbers.");
    }
    return data[0];
  }

  function buildSubmissionFilename(data) {
    const safeStudentName = (data.studentName || "student").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "student";
    const recordNumber = (data.registerNumber || data.applicationId || "").trim();
    return recordNumber ? `KIA_Admission_Form_${safeStudentName}_${recordNumber}.pdf` : `KIA_Admission_Form_${safeStudentName}.pdf`;
  }

  function mapSupabaseApplication(application) {
    const data = { ...(application.form_data || {}) };
    data.applicationId = application.application_id;
    data.registerNumber = application.registration_number || data.registerNumber || "";
    return {
      applicationId: application.application_id,
      status: application.status,
      submittedAt: application.submitted_at,
      data
    };
  }

  async function loadDashboardApplications() {
    const { data, error } = await supabaseClient.rpc("list_pending_admissions", {
      p_status: dashboardStatus
    });
    if (error) throw error;
    dashboardApplications = (data || []).map(mapSupabaseApplication);
    return dashboardApplications;
  }

  async function savePendingApplication(application) {
    const { error } = await supabaseClient.rpc("save_pending_admission", {
      p_application_id: application.applicationId,
      p_form: application.data,
      p_achievements: buildAchievementsPayload(application.data)
    });
    if (error) throw error;
  }

  function resetDynamicFields() {
    Array.from(achievementsList.children).forEach((card) => card.remove());
    achievementCount = 0;
    addAchievement();
    Array.from(hostelVisitorsList.children).forEach((card) => card.remove());
    for (let i = 0; i < 3; i += 1) addHostelVisitor();
  }

  function resetAdmissionForm() {
    form.reset();
    resetDynamicFields();
    form.querySelectorAll(".has-error").forEach((field) => field.classList.remove("has-error"));
    form.querySelectorAll(".field__error").forEach((error) => error.remove());
    reviewSummary.innerHTML = "";
    hostelPrefillState.initialized = false;
    currentStaffApplicationId = "";
    currentIndex = 0;
    syncHostelStep();
    renderRail();
    goTo(0);
  }

  function restoreApplicationToForm(data) {
    resetAdmissionForm();
    const achievementNumbers = Object.keys(data)
      .map((key) => key.match(/^achActivity_(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    const achievementTotal = Math.max(0, ...achievementNumbers);
    Array.from(achievementsList.children).forEach((card) => card.remove());
    achievementCount = 0;
    for (let index = 1; index <= achievementTotal; index += 1) {
      addAchievement({
        achCategory: data[`achCategory_${index}`] || "",
        achActivity: data[`achActivity_${index}`] || "",
        achLevel: data[`achLevel_${index}`] || "",
        achType: data[`achType_${index}`] || "",
        achDescription: data[`achDescription_${index}`] || ""
      });
    }
    if (!achievementTotal) addAchievement();

    Object.entries(data).forEach(([key, value]) => {
      const element = form.elements[key];
      if (!element || element.type === "file") return;
      if (element.type === "checkbox") element.checked = !!value;
      else element.value = value == null ? "" : value;
    });
    const bloodGroupOtherField = document.getElementById("bloodGroupOtherField");
    const communityOtherField = document.getElementById("communityOtherField");
    if (bloodGroupOtherField) bloodGroupOtherField.style.display = data.bloodGroup === "Other" ? "block" : "none";
    if (communityOtherField) communityOtherField.style.display = data.community === "Other" ? "block" : "none";
    hostelPrefillState.initialized = true;
    syncHostelStep();
    renderRail();
    goTo(0);
  }

  function showSubmissionStatus(message, isError) {
    const status = document.getElementById("saveIndicator");
    if (status) {
      status.textContent = message;
      status.style.color = isError ? "#8b1e1e" : "#1f5d48";
    }
    if (isError) {
      alert(message);
    }
  }

  function showStudentForm() {
    appMode = "student";
    landingView.hidden = true;
    staffDashboardView.hidden = true;
    staffReviewBar.hidden = true;
    staffFormBackBtn.hidden = true;
    studentFormView.hidden = false;
    document.body.classList.remove("staff-review-mode");
  }

  function showLanding() {
    appMode = "student";
    landingView.hidden = false;
    entryChoiceView.hidden = false;
    staffGateView.hidden = true;
    studentFormView.hidden = true;
    staffDashboardView.hidden = true;
    staffReviewBar.hidden = true;
    staffFormBackBtn.hidden = true;
    document.body.classList.remove("staff-review-mode");
  }

  async function showStaffDashboard() {
    appMode = "staff";
    landingView.hidden = true;
    studentFormView.hidden = true;
    staffReviewBar.hidden = true;
    staffFormBackBtn.hidden = true;
    staffDashboardView.hidden = false;
    document.body.classList.remove("staff-review-mode");
    try {
      await loadDashboardApplications();
      renderDashboard();
    } catch (error) {
      console.error("Could not load the staff dashboard.", error);
      const detail = String(error?.message || "").trim();
      showSubmissionStatus(detail
        ? `Could not load applications: ${detail}`
        : "Could not load applications. Run the staff-access SQL migration, then sign in again.", true);
    }
  }

  function applicationMatches(application, query) {
    if (!query) return true;
    const data = application.data || {};
    return [application.applicationId, data.registerNumber, data.studentName, data.studentMobile, data.email]
      .some((value) => String(value || "").toLowerCase().includes(query));
  }

  function renderDashboard() {
    const query = String(applicationSearch.value || "").trim().toLowerCase();
    const applications = dashboardApplications
      .filter((application) => applicationMatches(application, query));
    applicationsTableBody.innerHTML = "";
    dashboardEmpty.classList.toggle("is-visible", applications.length === 0);
    applications.forEach((application) => {
      const data = application.data || {};
      const row = document.createElement("tr");
      const statusClass = application.status === "Approved" ? " status-badge--approved" : "";
      row.innerHTML = `
        <td>${escapeHtml(data.studentName || "")}</td>
        <td>${escapeHtml(data.registerNumber || application.applicationId)}</td>
        <td>${escapeHtml(data.course || "")}</td>
        <td>${escapeHtml(data.admissionType || "")}</td>
        <td>${escapeHtml(data.studentMobile || "")}</td>
        <td>${escapeHtml(data.email || "")}</td>
        <td><span class="status-badge${statusClass}">${escapeHtml(application.status)}</span></td>
        <td>${escapeHtml(new Date(application.submittedAt).toLocaleString())}</td>
        <td>${application.status === "Pending Review"
          ? `<button type="button" class="btn btn--secondary dashboard-open-btn" data-application-id="${escapeHtml(application.applicationId)}">Open</button>`
          : `<span class="dashboard-readonly">Locked after approval</span>`}</td>`;
      applicationsTableBody.appendChild(row);
    });
  }

  function openStaffApplication(applicationId) {
    const application = dashboardApplications.find((item) => item.applicationId === applicationId);
    if (!application) return;
    restoreApplicationToForm(application.data || {});
    currentStaffApplicationId = applicationId;
    appMode = "staff";
    staffDashboardView.hidden = true;
    landingView.hidden = true;
    studentFormView.hidden = false;
    staffReviewBar.hidden = false;
    staffFormBackBtn.hidden = false;
    staffReviewIdentity.textContent = `${application.data.studentName || "Student"} · ${application.data.registerNumber || application.applicationId}`;
    document.body.classList.add("staff-review-mode");
    sectionStatus.textContent = "Staff review";
  }

  async function saveStaffApplication(approve) {
    const application = dashboardApplications.find((item) => item.applicationId === currentStaffApplicationId);
    if (!application) return;
    application.data = collectData();
    application.data.applicationId = application.applicationId;
    if (!approve) {
      try {
        await savePendingApplication(application);
      } catch (error) {
        console.error("Could not save staff changes.", error);
        showSubmissionStatus("Unable to save changes to Supabase.", true);
        return;
      }
      staffReviewIdentity.textContent = `${application.data.studentName || "Student"} · ${application.data.registerNumber || application.applicationId}`;
      showSubmissionStatus("Changes saved", false);
      return;
    }

    const approveButton = document.getElementById("staffApproveBtn");
    const previousLabel = approveButton.textContent;
    approveButton.disabled = true;
    approveButton.textContent = "Approving Application...";

    try {
      // Preserve staff edits before the approval transaction reads the form.
      await savePendingApplication(application);
      // This is the only point at which a pending student application is
      // forwarded to the official admission records in Supabase.
      const { data: approvalData, error: approvalError } = await supabaseClient.rpc("approve_pending_admission", {
        p_application_id: application.applicationId
      });
      if (approvalError) throw approvalError;
      const submission = approvalData && approvalData[0];
      if (!submission?.registration_number) throw new Error("Supabase did not return an approval registration number.");
      application.status = "Approved";
      application.approvedAt = new Date().toISOString();
      application.data.registerNumber = submission.registration_number;
      application.data.rollNumber = "";
      dashboardApplications = dashboardApplications.map((item) => item.applicationId === application.applicationId ? application : item);
      const pdfOutput = buildOfficialAdmissionPdf(application.data, {
        returnBlob: true,
        filename: buildSubmissionFilename(application.data),
        openViewer: false,
        saveFile: false
      });
      openGeneratedPdf(pdfOutput.blob, pdfOutput.filename);
      dashboardStatus = "Approved";
      document.querySelectorAll(".dashboard-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.status === dashboardStatus));
      showStaffDashboard();
      showSubmissionStatus("Application approved and forwarded to the supervisor records", false);
    } catch (error) {
      console.error("Approval failed.", error);
      showSubmissionStatus("Unable to forward this application to the supervisor records. It remains pending for review.", true);
    } finally {
      approveButton.disabled = false;
      approveButton.textContent = previousLabel;
    }
  }

  function openGeneratedPdf(pdfBlob, filename) {
    if (!pdfBlob || !(pdfBlob.size > 0)) {
      throw new Error("PDF generation failed: empty PDF blob.");
    }

    const pdfUrl = URL.createObjectURL(pdfBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = pdfUrl;
    downloadLink.download = filename;
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    let previewOpened = false;
    try {
      previewOpened = !!window.open(pdfUrl, "_blank", "noopener,noreferrer");
    } catch (previewError) {
      previewOpened = false;
    }

    return {
      pdfUrl,
      downloadTriggered: true,
      previewOpened,
      previewBlocked: !previewOpened
    };
  }

  async function handleSubmitApplication() {
    if (!validateAll()) return;

    const data = collectData();
    const checked = document.getElementById("confirmAccuracy");
    if (checked && !checked.checked) {
      checked.focus();
      alert("Please confirm the information is accurate before submitting.");
      return;
    }

    const controls = [reviewSubmitBtn, submitBtn].filter(Boolean);
    controls.forEach((button) => {
      button.disabled = true;
      button.textContent = "Submitting Application...";
    });

    try {
      // A student submission is intentionally kept out of the official
      // admission tables. Staff forwards it only after their approval.
      const pendingSubmission = await savePendingApplicationToSupabase(data);
      const pendingApplication = {
        applicationId: pendingSubmission.application_id,
        registrationNumber: pendingSubmission.registration_number,
        submittedAt: pendingSubmission.submitted_at,
        data
      };
      lastSubmittedApplication = {
        ...data,
        applicationId: pendingApplication.applicationId,
        submittedAt: pendingApplication.submittedAt,
        registerNumber: pendingApplication.registrationNumber,
        rollNumber: ""
      };
      resetAdmissionForm();

      const overlayTitle = document.querySelector("#successOverlay h2");
      const overlayText = document.querySelector("#successOverlay p");
      if (overlayTitle) overlayTitle.textContent = "Application submitted successfully.";
      if (overlayText) {
        overlayText.innerHTML = `Your application has been sent for staff review.<br><strong>Registration Number: ${pendingApplication.registrationNumber}</strong><br>A PDF will be generated only after staff approval.`;
      }

      successOverlay.hidden = false;
      showSubmissionStatus("Application sent for staff review", false);
    } catch (error) {
      console.error("Submission failed.", error);
      const detail = String(error?.message || error?.details || "").trim();
      showSubmissionStatus(detail
        ? `Unable to submit application: ${detail}`
        : "Unable to submit your application for staff review. Please try again.", true);
      controls.forEach((button) => {
        button.disabled = false;
        button.textContent = button.id === "reviewSubmitBtn" ? "Submit Application" : "Submit application";
      });
    }
  }

  /* ---------------- Submit ---------------- */
  submitBtn.addEventListener("click", handleSubmitApplication);
  reviewSubmitBtn.addEventListener("click", handleSubmitApplication);

  function buildOfficialAdmissionPdf(data, options = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;
    let y = 18;
    const hostelData = getHostelDataFromForm(data);
    const isHostel = String(data.hostelStatus || "").toLowerCase() === "yes";
    const displayPdfValue = (value) => {
      if (value === null || value === undefined || String(value).trim() === "") return "Not provided";
      return String(value);
    };

    const ensureSpace = (needed) => {
      if (y + needed > pageH - 18) {
        doc.addPage();
        y = 18;
      }
    };

    const sectionHeading = (title, fill = [24, 63, 52]) => {
      ensureSpace(12);
      doc.setFillColor(...fill);
      doc.rect(margin, y, contentW, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(title.toUpperCase(), margin + 3, y + 5.5);
      y += 8;
    };

    const addPartHeader = (title) => {
      ensureSpace(16);
      doc.setDrawColor(28, 62, 52);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 4;
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin + 2, y + 3);
      y += 10;
    };

    const splitValue = (value, width) => {
      const text = value === null || value === undefined || String(value).trim() === "" ? "" : String(value);
      return doc.splitTextToSize(text || "", width);
    };

    const valueLayout = (value, width, maxHeight = pageH - 36) => {
      const text = value === null || value === undefined || String(value).trim() === "" ? "" : String(value);
      let fontSize = 8;
      let lines = [];
      let lineHeight = 4.2;
      do {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fontSize);
        lines = text ? doc.splitTextToSize(String(text), width) : [""];
        lineHeight = fontSize <= 6.5 ? 3.4 : 4.2;
        if (8 + lines.length * lineHeight <= maxHeight || fontSize <= 5.5) break;
        fontSize -= 0.5;
      } while (fontSize >= 5.5);
      return { lines, fontSize, lineHeight };
    };

    // One field per row provides a stable, readable layout even for long
    // addresses, names and descriptions. Long values are continued on a new
    // page inside their own bordered row instead of crossing borders.
    const drawKeyValueTable = (title, rows) => {
      if (!rows || !rows.length) return;
      sectionHeading(title);
      const labelW = 57;
      const valueW = contentW - labelW;
      const bottomMargin = 18;

      rows.forEach(([label, rawValue]) => {
        const value = displayPdfValue(rawValue);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const labelLines = doc.splitTextToSize(String(label), labelW - 7);
        const layout = valueLayout(value, valueW - 8, pageH - 40);
        let remainingLines = layout.lines.slice();
        let continuation = false;

        while (remainingLines.length) {
          const availableHeight = pageH - bottomMargin - y;
          if (availableHeight < 14) {
            doc.addPage();
            y = 18;
            sectionHeading(`${title} (continued)`);
          }

          const lineCapacity = Math.max(1, Math.floor((pageH - bottomMargin - y - 7) / layout.lineHeight));
          const valueLines = remainingLines.splice(0, lineCapacity);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          const visibleLabelLines = continuation
            ? doc.splitTextToSize(`${label} (continued)`, labelW - 7)
            : labelLines;
          const rowHeight = Math.max(
            12,
            valueLines.length * layout.lineHeight + 7,
            visibleLabelLines.length * 3.8 + 7
          );
          const rowY = y;
          doc.setDrawColor(70, 70, 70);
          doc.setLineWidth(0.2);
          doc.rect(margin, rowY, contentW, rowHeight);
          doc.line(margin + labelW, rowY, margin + labelW, rowY + rowHeight);

          doc.setTextColor(40, 40, 40);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          visibleLabelLines.forEach((line, index) => doc.text(line, margin + 3, rowY + 5 + index * 3.8));

          doc.setFont("helvetica", "normal");
          doc.setFontSize(layout.fontSize);
          valueLines.forEach((line, index) => doc.text(String(line || ""), margin + labelW + 4, rowY + 5 + index * layout.lineHeight));
          y = rowY + rowHeight;
          continuation = true;
        }
      });
      y += 4;
    };

    const drawBlockTable = (title, rows, cols) => {
      if (!rows.length) return;
      sectionHeading(title);
      const left = margin;
      const tableW = contentW;
      const totalColWidth = cols.reduce((sum, col) => sum + col.width, 0);
      const widthScale = tableW / totalColWidth;
      const columnWidths = cols.map((col) => col.width * widthScale);
      const drawTableHeader = () => {
        ensureSpace(10);
        const headerY = y;
        doc.setDrawColor(70, 70, 70);
        doc.setLineWidth(0.2);
        doc.setFillColor(238, 240, 233);
        doc.rect(left, headerY, tableW, 8, "F");
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.8);
        let headerX = left;
        cols.forEach((col, idx) => {
          doc.text((col.title || "").toUpperCase(), headerX + 3, headerY + 5.5);
          if (idx < cols.length - 1) doc.line(headerX + columnWidths[idx], headerY, headerX + columnWidths[idx], headerY + 8);
          headerX += columnWidths[idx];
        });
        doc.rect(left, headerY, tableW, 8);
        y = headerY + 8;
      };

      drawTableHeader();
      doc.setDrawColor(70, 70, 70);
      doc.setLineWidth(0.2);
      rows.slice(1).forEach((row) => {
        const displayRow = row.map(displayPdfValue);
        const rowLayouts = displayRow.map((item, index) => valueLayout(item, columnWidths[index] - 6));
        const rowH = Math.max(12, ...rowLayouts.map((layout) => 6 + layout.lines.length * layout.lineHeight));
        const pageBefore = doc.internal.getNumberOfPages();
        ensureSpace(rowH + 2);
        if (doc.internal.getNumberOfPages() !== pageBefore) drawTableHeader();
        const cursorY = y;
        let cellX = left;
        displayRow.forEach((cell, index) => {
          const colWidth = columnWidths[index];
          doc.rect(cellX, cursorY, colWidth, rowH);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(rowLayouts[index].fontSize);
          rowLayouts[index].lines.forEach((line, lineIdx) => {
            doc.text(String(line || ""), cellX + 3, cursorY + 5 + lineIdx * rowLayouts[index].lineHeight);
          });
          cellX += colWidth;
        });
        y = cursorY + rowH;
      });
      y += 4;
    };

    const addDeclaration = (title, declarationText) => {
      sectionHeading(title, [67, 78, 73]);
      const boxH = 34;
      ensureSpace(boxH + 4);
      const boxY = y;
      doc.setDrawColor(70, 70, 70);
      doc.setLineWidth(0.2);
      doc.rect(margin, boxY, contentW, boxH);
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      const lines = doc.splitTextToSize(declarationText, contentW - 10);
      lines.forEach((line, idx) => doc.text(line, margin + 5, boxY + 8 + idx * 5));
      const dateY = boxY + 25;
      doc.setLineWidth(0.2);
      doc.line(margin + 65, dateY, margin + 120, dateY);
      doc.line(margin + 125, dateY, margin + contentW - 10, dateY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Student Signature:", margin + 10, dateY - 1);
      doc.text("Date:", margin + 130, dateY - 1);
      y = boxY + boxH + 8;
    };

    const addRoomAllocationField = () => {
      ensureSpace(12);
      doc.setDrawColor(70, 70, 70);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentW, 10);
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Room Allocated (For Office Use):", margin + 4, y + 7);
      doc.line(margin + 78, y + 8, pageW - margin - 8, y + 8);
      y += 16;
    };

    const addHeader = () => {
      doc.setFillColor(245, 245, 240);
      doc.rect(0, 0, pageW, 18, "F");
      doc.setTextColor(32, 51, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("KUMARAGURU INSTITUTE OF AGRICULTURE", pageW / 2, 11, { align: "center" });
      y = 25;
      doc.setTextColor(28, 28, 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("ADMISSION / STUDENT INFORMATION FORM", pageW / 2, y, { align: "center" });
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.text("Academic Year 2026-27", pageW / 2, y, { align: "center" });
      y += 12;

      const boxY = y;
      const boxW = 78;
      const boxH = 12;
      const leftBoxX = margin;
      const rightBoxX = leftBoxX + 92;
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.2);
      doc.rect(leftBoxX, boxY, boxW, boxH);
      doc.rect(rightBoxX, boxY, boxW, boxH);
      doc.rect(leftBoxX + 43, boxY, boxW - 43, boxH);
      doc.rect(rightBoxX + 35, boxY, boxW - 35, boxH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Registration No.", leftBoxX + 4, boxY + 8);
      doc.text("Roll No.", rightBoxX + 4, boxY + 8);

      const regVal = data.registerNumber || "";
      const rollVal = data.rollNumber || "";
      if (regVal) {
        doc.setFont("helvetica", "normal");
        doc.text(String(regVal), leftBoxX + 48, boxY + 8);
      }
      if (rollVal) {
        doc.setFont("helvetica", "normal");
        doc.text(String(rollVal), rightBoxX + 40, boxY + 8);
      }
      y = boxY + boxH + 6;
    };

    addHeader();
    addPartHeader("PART A — COLLEGE ADMISSION FORM");

    drawKeyValueTable("1. STUDENT & ADMISSION DETAILS", [
      ["Student Name", data.studentName || ""],
      ["TNAU Allotment Number", data.tnauNumber || ""],
      ["Admission Type", data.admissionType || ""],
      ["Admission Quota", data.admissionQuota || ""],
      ["Course / Programme", data.course || ""],
      ["First Graduate", data.firstGraduate || ""],
      ["Hosteller / Dayscholar", data.hostelStatus || ""],
      ["Academic Year / Batch", data.batch || ""]
    ]);

    drawKeyValueTable("2. PERSONAL INFORMATION", [
      ["Date of Birth", data.dob || ""],
      ["Gender", data.gender || ""],
      ["Blood Group", data.bloodGroup === "Other" ? (data.bloodGroupOther || "") : (data.bloodGroup || "")],
      ["Nationality", data.nationality || ""],
      ["Religion", data.religion || ""],
      ["Community", data.community === "Other" ? (data.communityOther || "") : (data.community || "")],
      ["Caste", data.caste || ""],
      ["Mother Tongue", data.motherTongue || ""]
    ]);

    drawKeyValueTable("3. CONTACT & ADDRESS", [
      ["Student Mobile", data.studentMobile || ""],
      ["WhatsApp Number", data.whatsapp || ""],
      ["Email ID", data.email || ""],
      ["Communication Address", data.commAddress || ""],
      ["Permanent Address", data.permAddress || ""],
      ["District", data.district || ""],
      ["State", data.state || ""],
      ["PIN Code", data.pincode || ""],
      ["Emergency Contact 1", data.emergency1 || ""],
      ["Emergency Contact 2", data.emergency2 || ""]
    ]);

    drawKeyValueTable("4. EDUCATIONAL PROFILE - X STANDARD", [
      ["Board", data.xBoard || ""],
      ["School Name", data.xSchool || ""],
      ["School Address", data.xSchoolAddress || ""],
      ["Month & Year of Passing", data.xPassing || ""],
      ["Medium", data.xMedium || ""],
      ["Marks", data.xMarks || ""]
    ]);

    drawKeyValueTable("4. EDUCATIONAL PROFILE - XII STANDARD", [
      ["Board", data.xiiBoard || ""],
      ["School Name", data.xiiSchool || ""],
      ["School Address", data.xiiSchoolAddress || ""],
      ["Month & Year of Passing", data.xiiPassing || ""],
      ["Medium", data.xiiMedium || ""],
      ["Marks", data.xiiMarks || ""]
    ]);

    const subjectRows = [
      ["Language", data.mLanguage || ""],
      ["English", data.mEnglish || ""],
      ["Mathematics", data.mMaths || ""],
      ["Physics", data.mPhysics || ""],
      ["Chemistry", data.mChemistry || ""],
      ["Biology", data.mBiology || ""],
      ["Botany", data.mBotany || ""],
      ["Zoology", data.mZoology || ""],
      ["Computer Science", data.mComputerScience || ""],
      ["Total", data.mTotal || ""],
      ["Cut-off Scored in XII Standard", data.xiiCutoff || ""],
      ["EMIS Number", data.emisNumber || ""]
    ];
    drawKeyValueTable("5. XII STANDARD SUBJECT-WISE MARKS", subjectRows);

    drawKeyValueTable("6. FAMILY PROFILE", [
      ["Father / Guardian Name", data.fatherName || ""],
      ["Father Educational Qualification", data.fatherQualification || ""],
      ["Father Occupation", data.fatherOccupation || ""],
      ["Father Company / Organization", data.fatherCompany || ""],
      ["Father Email", data.fatherEmail || ""],
      ["Father Mobile", data.fatherMobile || ""],
      ["Mother Name", data.motherName || ""],
      ["Mother Educational Qualification", data.motherQualification || ""],
      ["Mother Occupation", data.motherOccupation || ""],
      ["Mother Company / Organization", data.motherCompany || ""],
      ["Mother Email", data.motherEmail || ""],
      ["Mother Mobile", data.motherMobile || ""],
      ["Annual Income", data.familyIncome || ""]
    ]);

    drawKeyValueTable("7. ADDITIONAL INFORMATION", [
      ["Board of Study", data.boardOfStudy || ""],
      ["Medium of Study", data.mediumOfStudy || ""],
      ["School Type", data.schoolType || ""],
      ["Studied Tamil in XII", data.tamilXii || ""],
      ["Family Background", data.familyBackground || ""]
    ]);

    drawKeyValueTable("8. AGRICULTURAL / FAMILY BACKGROUND", [
      ["Agricultural Land Availability", data.landAvailability || ""],
      ["Agricultural Land Area", data.landArea || ""],
      ["Crops Planted", data.majorCrops || ""],
      ["Locality of Agricultural Land", data.landLocality || ""],
      ["Area of Residence", data.residenceType || ""]
    ]);

    drawKeyValueTable("OFFICIAL / BANK INFORMATION", [
      ["Bank Account Holder Name", data.bankHolder || ""],
      ["Relationship with Account Holder", data.holderRelationship || ""],
      ["Bank Name", data.bankName || ""],
      ["Bank Branch", data.bankBranch || ""],
      ["Bank Account Number", data.bankAccount || ""],
      ["Bank IFSC", data.bankIfsc || ""],
      ["Loan Account Number", data.loanAccount || ""],
      ["Loan IFSC", data.loanIfsc || ""],
      ["Loan Bank & Branch", data.loanBankBranch || ""],
      ["Passport Number", data.passportNumber || ""],
      ["Aadhaar Number", data.aadhaarNumber || ""]
    ]);

    const achievementNumbers = Object.keys(data)
      .map((key) => key.match(/^achActivity_(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .sort((a, b) => a - b);
    const achievementRows = (achievementNumbers.length ? achievementNumbers : [1]).map((n) => {
        return [
          data[`achCategory_${n}`] || "",
          data[`achActivity_${n}`] || "",
          data[`achLevel_${n}`] || "",
          data[`achType_${n}`] || "",
          data[`achDescription_${n}`] || ""
        ];
      });
    drawBlockTable("9. ACHIEVEMENTS", [
      ["Category", "Activity", "Level", "Type", "Description"],
      ...achievementRows
    ], [
      { title: "Category", width: 28 },
      { title: "Activity", width: 35 },
      { title: "Level", width: 22 },
      { title: "Type", width: 22 },
      { title: "Description", width: 75 }
    ]);

    addDeclaration("10. COLLEGE ADMISSION DECLARATION", "I hereby declare that all the above furnished details are true to the best of my knowledge.");

    {
      addPartHeader(isHostel ? "PART B — HOSTEL ADMISSION FORM" : "PART B — HOSTEL ADMISSION FORM (NOT SELECTED)");

      drawKeyValueTable("1. HOSTEL APPLICANT DETAILS", [
        ["Roll No.", hostelData.rollNumber || ""],
        ["Name of Applicant", hostelData.applicantName || ""],
        ["Course / Branch", hostelData.courseBranch || ""],
        ["Father / Mother Name", hostelData.parentName || ""],
        ["Date of Birth", hostelData.dateOfBirth || ""],
        ["Blood Group", hostelData.bloodGroup || ""],
        ["Allergy to any medicine", hostelData.medicineAllergy || ""],
        ["Allergy Details", hostelData.allergyDetails || ""],
        ["Email ID", hostelData.email || ""],
        ["Mobile Number", hostelData.mobile || ""]
      ]);

      drawKeyValueTable("2. HOSTEL ADDRESS DETAILS", [
        ["Address of Correspondence", hostelData.address || ""],
        ["Correspondence Phone Number", hostelData.correspondencePhone || ""],
        ["Permanent Address", hostelData.permanentAddress || ""],
        ["Permanent Address Phone Number", hostelData.permanentPhone || ""]
      ]);

      drawKeyValueTable("3. LOCAL GUARDIAN DETAILS", [
        ["Local Guardian Name", hostelData.localGuardianName || ""],
        ["Local Guardian Address", hostelData.localGuardianAddress || ""],
        ["Local Guardian Phone Number", hostelData.localGuardianPhone || ""],
        ["Local Guardian Occupation / Designation", hostelData.localGuardianOccupation || ""]
      ]);

      drawKeyValueTable("4. PARENT OCCUPATION", [
        ["Father's Occupation / Designation", hostelData.fatherOccupation || ""],
        ["Mother's Occupation / Designation", hostelData.motherOccupation || ""]
      ]);

      const visitorRowsSource = hostelData.visitors && hostelData.visitors.length ? hostelData.visitors : [{ name: "", address: "", phone: "", relationship: "" }, { name: "", address: "", phone: "", relationship: "" }, { name: "", address: "", phone: "", relationship: "" }];
      const visitorRows = visitorRowsSource.slice(0, 3).map((visitor, idx) => [
        String(idx + 1),
        visitor.name || "",
        visitor.address || "",
        visitor.phone || "",
        visitor.relationship || ""
      ]);
      drawBlockTable("5. RELATIVES / VISITORS", [
        ["S.No.", "Name", "Address", "Phone Number", "Relationship"],
        ...visitorRows
      ], [
        { title: "S.No.", width: 14 },
        { title: "Name", width: 28 },
        { title: "Address", width: 36 },
        { title: "Phone Number", width: 28 },
        { title: "Relationship", width: 30 }
      ]);

      drawKeyValueTable("6. HOLIDAY TRAVEL ARRANGEMENT", [
        ["Holiday Travel Arrangement", hostelData.holidayTravel || ""]
      ]);

      drawKeyValueTable("7. EMERGENCY CONTACT", [
        ["Name", hostelData.emergencyName || ""],
        ["Residence Phone Number", hostelData.emergencyResidencePhone || ""],
        ["Office Phone Number", hostelData.emergencyOfficePhone || ""],
        ["Relationship with Student", hostelData.emergencyRelationship || ""]
      ]);

      addRoomAllocationField();
      addDeclaration("9. HOSTEL ADMISSION DECLARATION", "I hereby declare that the hostel information furnished above is true and correct to the best of my knowledge and I agree to abide by the hostel rules and regulations.");
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("Page " + i + " of " + pageCount, pageW - margin, pageH - 8, { align: "right" });
    }

    const pdfBlob = doc.output("blob");
    const safeName = (data.studentName || "student").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const regNo = (data.registerNumber || "").trim();
    const filename = options.filename || (regNo ? `KIA_Admission_Form_${safeName}_${regNo}.pdf` : `KIA_Admission_Form_${safeName}.pdf`);

    if (options.returnBlob) {
      return { blob: pdfBlob, filename };
    }

    if (options.openViewer) {
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const viewer = window.open(pdfUrl, "_blank", "noopener,noreferrer");
      if (!viewer) {
        alert("Please allow pop-ups to open the PDF preview in a native PDF viewer.");
        URL.revokeObjectURL(pdfUrl);
        return { blob: pdfBlob, filename };
      }
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      return { blob: pdfBlob, filename, url: pdfUrl };
    }

    if (options.saveFile) {
      const link = document.createElement("a");
      const url = URL.createObjectURL(pdfBlob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { blob: pdfBlob, filename, url };
    }

    return { blob: pdfBlob, filename };
  }
  if (backToEditBtn) {
    backToEditBtn.addEventListener("click", () => {
      const hostelIndex = panels.findIndex((panel) => panel.dataset.section === "hostel");
      if (hostelStatus && hostelStatus.value === "Yes" && hostelIndex >= 0) {
        goTo(hostelIndex);
      } else {
        goTo(panels.length - 1);
      }
    });
  }
  document.getElementById("closeOverlay").addEventListener("click", () => {
    successOverlay.hidden = true;
  });
  if (downloadSubmittedPdfBtn) {
    downloadSubmittedPdfBtn.addEventListener("click", () => {
      if (!lastSubmittedApplication) return;
      const pdfOutput = buildOfficialAdmissionPdf(lastSubmittedApplication, {
        returnBlob: true,
        filename: buildSubmissionFilename(lastSubmittedApplication),
        openViewer: false,
        saveFile: false
      });
      openGeneratedPdf(pdfOutput.blob, pdfOutput.filename);
    });
  }

  /* ---------------- PDF export (mirrors the official paper form) ---------------- */
  const PDF = {
    pageW: 210,
    pageH: 297,
    margin: 16,
    cols: 3,
    teal: [27, 68, 56],
    tealDark: [18, 51, 42],
    soil: [91, 70, 54],
    label: [110, 105, 90],
    text: [26, 26, 26],
    line: [222, 217, 200]
  };
  PDF.contentW = PDF.pageW - PDF.margin * 2;
  PDF.colW = PDF.contentW / PDF.cols;

  function pdfEnsureSpace(doc, y, needed) {
    if (y + needed > PDF.pageH - PDF.margin - 8) {
      doc.addPage();
      return PDF.margin;
    }
    return y;
  }

  function pdfHeader(doc, data) {
    let y = PDF.margin;
    doc.setFont("times", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF.soil);
    doc.text("KUMARAGURU INSTITUTE OF AGRICULTURE", PDF.pageW / 2, y, { align: "center" });
    y += 8;
    doc.setFont("times", "bold");
    doc.setFontSize(21);
    doc.setTextColor(...PDF.tealDark);
    doc.text("Student Admission Form", PDF.pageW / 2, y, { align: "center" });
    y += 7;
    doc.setFont("times", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(90, 90, 90);
    const parts = [];
    if (data.batch) parts.push(`Batch ${data.batch}`);
    if (data.course) parts.push(data.course);
    doc.text(parts.length ? parts.join("   \u2022   ") : " ", PDF.pageW / 2, y, { align: "center" });
    y += 5;
    doc.setDrawColor(...PDF.tealDark);
    doc.setLineWidth(0.7);
    doc.line(PDF.margin, y, PDF.pageW - PDF.margin, y);
    return y + 10;
  }

  function pdfSectionTitle(doc, y, title) {
    const barH = 7.5;
    y = pdfEnsureSpace(doc, y, barH + 13);
    doc.setFillColor(...PDF.teal);
    doc.rect(PDF.margin, y, PDF.contentW, barH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), PDF.margin + 3.5, y + barH - 2.3);
    return y + barH;
  }

  function pdfMeasureCell(doc, value, width) {
    doc.setFont("times", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(String(value || "\u2014"), width - 6);
    return { lines, height: Math.max(13, 8 + lines.length * 4.3) };
  }

  function pdfDrawRow(doc, y, rowCells, colWidth) {
    let rowHeight = 0;
    const measured = rowCells.map((c) => {
      const m = pdfMeasureCell(doc, c.value, colWidth);
      rowHeight = Math.max(rowHeight, m.height);
      return m;
    });
    y = pdfEnsureSpace(doc, y, rowHeight);
    let x = PDF.margin;
    rowCells.forEach((c, i) => {
      doc.setDrawColor(...PDF.line);
      doc.setLineWidth(0.2);
      doc.rect(x, y, colWidth, rowHeight);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...PDF.label);
      doc.text(c.label.toUpperCase(), x + 3, y + 4.2);
      doc.setFont("times", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...PDF.text);
      measured[i].lines.forEach((line, li) => {
        doc.text(line, x + 3, y + 9 + li * 4.3);
      });
      x += colWidth;
    });
    return y + rowHeight;
  }

  function pdfDrawGrid(doc, y, cells) {
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      y = pdfDrawRow(doc, y, buffer, PDF.colW);
      buffer = [];
    };
    cells.forEach((cell) => {
      if (cell.wide) {
        flush();
        y = pdfDrawRow(doc, y, [cell], PDF.contentW);
      } else {
        buffer.push(cell);
        if (buffer.length === PDF.cols) flush();
      }
    });
    flush();
    return y;
  }

  function pdfSection(doc, y, title, cells) {
    y = pdfSectionTitle(doc, y, title);
    y = pdfDrawGrid(doc, y, cells);
    return y + 6;
  }

  function pdfBuildCells(data, keys) {
    return keys.map((k) => {
      let value = data[k] ? String(data[k]) : "\u2014";
      if (k === "registerNumber" && !data[k]) value = "To be generated";
      return { label: FIELD_LABELS[k] || k, value, wide: WIDE_KEYS.has(k) };
    });
  }

  function pdfBuildAchievementCells(data) {
    const achCards = Array.from(achievementsList.children);
    if (achCards.length === 0) {
      return [{ label: "Achievements", value: "None recorded.", wide: true }];
    }
    const cells = [];
    achCards.forEach((card, i) => {
      const n = card.dataset.achievement;
      cells.push({ label: `#${i + 1} Category`, value: data[`achCategory_${n}`] || "\u2014" });
      cells.push({ label: `#${i + 1} Activity`, value: data[`achActivity_${n}`] || "\u2014" });
      cells.push({ label: `#${i + 1} Level`, value: data[`achLevel_${n}`] || "\u2014" });
      cells.push({ label: `#${i + 1} Type`, value: data[`achType_${n}`] || "\u2014" });
      cells.push({ label: `#${i + 1} Description`, value: data[`achDescription_${n}`] || "\u2014", wide: true });
    });
    return cells;
  }

  function generatePdf(data) {
    buildOfficialAdmissionPdf(data, { saveFile: true });
  }

  function validateAll() {
    let firstInvalid = -1;
    panels.forEach((panel, i) => {
      const good = validateSection(i);
      if (!good && firstInvalid === -1) firstInvalid = i;
      markComplete(i);
    });
    updateProgress();
    if (firstInvalid !== -1) {
      goTo(firstInvalid);
      return false;
    }
    return true;
  }

  document.getElementById("studentEntryBtn").addEventListener("click", () => {
    showStudentForm();
  });

  document.getElementById("staffEntryBtn").addEventListener("click", () => {
    entryChoiceView.hidden = true;
    staffGateView.hidden = false;
    staffEmailInput.focus();
  });

  document.getElementById("staffBackBtn").addEventListener("click", showLanding);
  function setStaffAuthMode(mode) {
    staffAuthMode = mode;
    const isSignup = mode === "signup";
    staffConfirmPasswordGroup.hidden = !isSignup;
    staffConfirmPasswordInput.required = isSignup;
    staffPasswordInput.autocomplete = isSignup ? "new-password" : "current-password";
    staffAuthDescription.textContent = isSignup
      ? "Create your staff account with your institutional email and a secure password."
      : "Log in with your institutional email and password to review applications.";
    staffAuthSubmitBtn.textContent = isSignup ? "Create Staff Account" : "Log in to Staff Dashboard";
    staffAuthModeBtn.textContent = isSignup ? "Already registered? Log in" : "First time here? Create account";
    staffGateError.textContent = "";
  }
  staffAuthModeBtn.addEventListener("click", () => setStaffAuthMode(staffAuthMode === "signup" ? "login" : "signup"));
  staffGateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = staffEmailInput.value.trim().toLowerCase();
    if (!isAllowedStaffEmail(email)) {
      staffGateError.textContent = "Please enter an authorized staff email address.";
      staffEmailInput.focus();
      return;
    }
    if (staffPasswordInput.value.length < 8) {
      staffGateError.textContent = "Use a password with at least 8 characters.";
      staffPasswordInput.focus();
      return;
    }
    if (staffAuthMode === "signup" && staffPasswordInput.value !== staffConfirmPasswordInput.value) {
      staffGateError.textContent = "Password and confirmation password do not match.";
      staffConfirmPasswordInput.focus();
      return;
    }
    staffGateError.textContent = "";
    staffAuthSubmitBtn.disabled = true;
    staffAuthSubmitBtn.textContent = staffAuthMode === "signup" ? "Creating account..." : "Logging in...";
    try {
      if (staffAuthMode === "signup") {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password: staffPasswordInput.value
        });
        if (error) throw error;
        if (!data.session) {
          staffGateError.textContent = "Account was created, but email confirmation is still enabled in Supabase. Disable Confirm email to use password-only access.";
          return;
        }
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password: staffPasswordInput.value
        });
        if (error) throw error;
      }
      currentStaffEmail = email;
      await showStaffDashboard();
    } catch (error) {
      console.error("Staff authentication failed.", error);
      const message = String(error?.message || "Unable to complete staff sign-in.");
      if (/already registered|already exists|user already/i.test(message) && staffAuthMode === "signup") {
        setStaffAuthMode("login");
        staffGateError.textContent = "This email already has a Supabase Auth account. For the one-time test reset, run the reset SQL migration, then create the account again.";
      } else {
        staffGateError.textContent = /email provider is disabled/i.test(message)
          ? "Supabase Email provider is disabled. Enable Authentication → Providers → Email in Supabase, then try again."
          : message;
      }
    } finally {
      staffAuthSubmitBtn.disabled = false;
      staffAuthSubmitBtn.textContent = staffAuthMode === "signup" ? "Create Staff Account" : "Log in to Staff Dashboard";
    }
  });
  applicationSearch.addEventListener("input", renderDashboard);
  document.querySelectorAll(".dashboard-tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      dashboardStatus = tab.dataset.status;
      document.querySelectorAll(".dashboard-tab").forEach((item) => item.classList.toggle("is-active", item === tab));
      await showStaffDashboard();
    });
  });
  applicationsTableBody.addEventListener("click", (event) => {
    const button = event.target.closest(".dashboard-open-btn");
    if (button) openStaffApplication(button.dataset.applicationId);
  });
  document.getElementById("dashboardHomeBtn").addEventListener("click", showLanding);
  document.getElementById("newStudentBtn").addEventListener("click", () => {
    resetAdmissionForm();
    showStudentForm();
  });
  document.getElementById("staffReviewBackBtn").addEventListener("click", showStaffDashboard);
  staffFormBackBtn.addEventListener("click", showStaffDashboard);
  document.getElementById("staffSaveBtn").addEventListener("click", () => saveStaffApplication(false));
  document.getElementById("staffApproveBtn").addEventListener("click", () => saveStaffApplication(true));

  /* ---------------- Init ---------------- */
  addAchievement(); // start with one empty achievement card
  try { localStorage.removeItem("kia_admission_draft_v1"); } catch (error) {}
  if (hostelStatus) {
    hostelStatus.addEventListener("change", syncHostelStep);
  }
  loadDraft();
  syncHostelStep();
  renderRail();
  goTo(0);
  updateProgress();
})();
