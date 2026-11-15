library(haven)
library(tidyverse)

# 1. Read raw CDC NHANES XPT files for 2011-2012 (G) and 2013-2014 (H)
demo_raw <- bind_rows(
  read_xpt("data/raw/DEMO_G.XPT") |> mutate(cycle = "2011-2012"),
  read_xpt("data/raw/DEMO_H.XPT") |> mutate(cycle = "2013-2014")
)

slq_raw <- bind_rows(
  read_xpt("data/raw/SLQ_G.XPT"),
  read_xpt("data/raw/SLQ_H.XPT")
)

mgx_raw <- bind_rows(
  read_xpt("data/raw/MGX_G.XPT"),
  read_xpt("data/raw/MGX_H.XPT")
)

# 2. Merge across modules using respondent sequence number (SEQN)
merged_all <- demo_raw |>
  inner_join(slq_raw, by = "SEQN") |>
  inner_join(mgx_raw, by = "SEQN")

# 3. Recode NHANES special missing codes (77/99 and 7/9) and clean variables
cleaned <- merged_all |>
  mutate(
    sleep_hours = if_else(SLD010H %in% c(77, 99), NA_real_, as.numeric(SLD010H)),
    combined_grip_kg = as.numeric(MGDCGSZ),
    max_hand_grip_kg = pmax(
      MGXH1T1, MGXH1T2, MGXH1T3,
      MGXH2T1, MGXH2T2, MGXH2T3,
      na.rm = TRUE
    ),
    age = as.numeric(RIDAGEYR),
    sex = case_when(
      RIAGENDR == 1 ~ "Male",
      RIAGENDR == 2 ~ "Female",
      TRUE ~ NA_character_
    ) |> factor(levels = c("Male", "Female")),
    age_group = case_when(
      age >= 16 & age <= 29 ~ "16-29",
      age >= 30 & age <= 44 ~ "30-44",
      age >= 45 & age <= 59 ~ "45-59",
      age >= 60 & age <= 74 ~ "60-74",
      age >= 75 ~ "75-80+"
    ) |> factor(levels = c("16-29", "30-44", "45-59", "60-74", "75-80+")),
    sleep_category = case_when(
      sleep_hours <= 5 ~ "Very Short (<=5h)",
      sleep_hours == 6 ~ "Short (6h)",
      sleep_hours %in% c(7, 8) ~ "Recommended (7-8h)",
      sleep_hours >= 9 ~ "Long (9+h)"
    ) |> factor(levels = c(
      "Very Short (<=5h)",
      "Short (6h)",
      "Recommended (7-8h)",
      "Long (9+h)"
    )),
    race_ethnicity = case_when(
      RIDRETH3 == 1 ~ "Mexican American",
      RIDRETH3 == 2 ~ "Other Hispanic",
      RIDRETH3 == 3 ~ "Non-Hispanic White",
      RIDRETH3 == 4 ~ "Non-Hispanic Black",
      RIDRETH3 == 6 ~ "Non-Hispanic Asian",
      RIDRETH3 == 7 ~ "Other / Multi-Racial",
      TRUE ~ NA_character_
    ),
    trouble_sleeping = case_when(
      SLQ050 == 1 ~ "Yes",
      SLQ050 == 2 ~ "No",
      TRUE ~ NA_character_
    ),
    sleep_disorder = case_when(
      SLQ060 == 1 ~ "Yes",
      SLQ060 == 2 ~ "No",
      TRUE ~ NA_character_
    ),
    income_pir = as.numeric(INDFMPIR),
    mec_weight_4yr = WTMEC2YR / 2
  )

# 4. Filter to observations with valid sleep duration, combined grip strength, and age
analytical <- cleaned |>
  filter(!is.na(sleep_hours), !is.na(combined_grip_kg), !is.na(age)) |>
  select(
    SEQN, cycle, age, age_group, sex, race_ethnicity, income_pir,
    sleep_hours, sleep_category, trouble_sleeping, sleep_disorder,
    combined_grip_kg, max_hand_grip_kg, MGDEXSTS, mec_weight_4yr
  )

# 5. Document exact sample-size flow
sample_flow <- tibble(
  step = c(
    "Total NHANES 2011-2014 participants (DEMO_G + DEMO_H)",
    "Participants in Sleep Questionnaire (SLQ_G + SLQ_H, ages 16+)",
    "Participants in Muscle Strength Exam (MGX_G + MGX_H, ages 6+)",
    "Inner-joined across DEMO + SLQ + MGX (ages 16+ examined in MEC)",
    "Excluded: missing or refused/don't-know sleep hours (NA, 77, 99)",
    "Excluded: missing combined grip strength (incomplete bilateral test)",
    "Final clean analytical dataset"
  ),
  n = c(
    nrow(demo_raw),
    nrow(slq_raw),
    nrow(mgx_raw),
    nrow(merged_all),
    sum(is.na(cleaned$sleep_hours)),
    sum(!is.na(cleaned$sleep_hours) & is.na(cleaned$combined_grip_kg)),
    nrow(analytical)
  )
)

write_rds(analytical, "data/processed/nhanes_sleep_strength.rds")
write_csv(analytical, "data/processed/nhanes_sleep_strength.csv")
write_csv(sample_flow, "data/processed/sample_flow.csv")

print(sample_flow)
