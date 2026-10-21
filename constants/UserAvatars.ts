import { type ImageSourcePropType } from "react-native";
import { getPresetAvatarUri, type PresetAvatar } from "@/constants/presetAvatar";

export type UserAvatarGender = "male" | "female";
export type UserAvatarPreset = PresetAvatar & { gender: UserAvatarGender };

/**
 * Include all bundled files from `assets/avatars` and keep seeds stable.
 * Order: male first, then female (so pickers can segment cleanly).
 */
export const USER_2D_AVATARS: UserAvatarPreset[] = [
  { seed: "user-1", name: "Adult", gender: "male", image: require("../assets/avatars/adult.png") },
  { seed: "user-2", name: "Arabian", gender: "male", image: require("../assets/avatars/arabian.png") },
  { seed: "user-3", name: "Assassin", gender: "male", image: require("../assets/avatars/assasin.png") },
  { seed: "user-4", name: "Astronaut", gender: "male", image: require("../assets/avatars/astronaut.png") },
  { seed: "user-5", name: "Astronaut Avatar", gender: "male", image: require("../assets/avatars/astronaut-avatar.png") },
  { seed: "user-6", name: "Bearded Man", gender: "male", image: require("../assets/avatars/bearded-man.png") },
  { seed: "user-7", name: "Boy", gender: "male", image: require("../assets/avatars/boy.png") },
  { seed: "user-8", name: "Boy Avatar", gender: "male", image: require("../assets/avatars/boy-avatar.png") },
  { seed: "user-9", name: "Boxer", gender: "male", image: require("../assets/avatars/boxer.png") },
  { seed: "user-10", name: "Businessman", gender: "male", image: require("../assets/avatars/businessman.png") },
  { seed: "user-11", name: "Chef", gender: "male", image: require("../assets/avatars/chef.png") },
  { seed: "user-12", name: "Check Profile", gender: "male", image: require("../assets/avatars/check-profile.png") },
  { seed: "user-13", name: "Cool Man", gender: "male", image: require("../assets/avatars/cool-man.png") },
  { seed: "user-14", name: "Cowboy", gender: "male", image: require("../assets/avatars/cowboy-is-wearing-hat.png") },
  { seed: "user-15", name: "Curly Hair Hat", gender: "male", image: require("../assets/avatars/curly-hair-man-with-hat.png") },
  { seed: "user-16", name: "Curly Hair Glasses", gender: "male", image: require("../assets/avatars/curly-hair-man-with-glasses.png") },
  { seed: "user-17", name: "Doctor", gender: "male", image: require("../assets/avatars/doctor.png") },
  { seed: "user-18", name: "Employee", gender: "male", image: require("../assets/avatars/employee-young-man.png") },
  { seed: "user-19", name: "Gamer", gender: "male", image: require("../assets/avatars/gamer.png") },
  { seed: "user-20", name: "Graduate", gender: "male", image: require("../assets/avatars/graduate-avatar-icon.png") },
  { seed: "user-21", name: "Grandpa", gender: "male", image: require("../assets/avatars/grandpa.png") },
  { seed: "user-22", name: "Knowledgeable Teacher", gender: "male", image: require("../assets/avatars/knowledgeable-avatar-teacher.png") },
  { seed: "user-23", name: "Lab Technician", gender: "male", image: require("../assets/avatars/lab-technician.png") },
  { seed: "user-24", name: "Manager", gender: "male", image: require("../assets/avatars/manager.png") },
  { seed: "user-25", name: "Man", gender: "male", image: require("../assets/avatars/man.png") },
  { seed: "user-26", name: "Man 2", gender: "male", image: require("../assets/avatars/man-2.png") },
  { seed: "user-27", name: "Man Avatar", gender: "male", image: require("../assets/avatars/man-avatar.png") },
  { seed: "user-28", name: "Man Avatar 2", gender: "male", image: require("../assets/avatars/man-avatar-2.png") },
  { seed: "user-29", name: "Man Avatar 3", gender: "male", image: require("../assets/avatars/man-avatar-3.png") },
  { seed: "user-30", name: "Meteorologist", gender: "male", image: require("../assets/avatars/meteorologist.png") },
  { seed: "user-31", name: "Motorcyclist", gender: "male", image: require("../assets/avatars/motorcyclist-avatar.png") },
  { seed: "user-32", name: "Mountain Climber", gender: "male", image: require("../assets/avatars/mountain-climber.png") },
  { seed: "user-33", name: "Native American", gender: "male", image: require("../assets/avatars/native-american-spiritual-leader-avatar.png") },
  { seed: "user-34", name: "Old Man", gender: "male", image: require("../assets/avatars/old-man.png") },
  { seed: "user-35", name: "Old Man 2", gender: "male", image: require("../assets/avatars/old-man-2.png") },
  { seed: "user-36", name: "Old Man Avatar", gender: "male", image: require("../assets/avatars/old-man-avatar.png") },
  { seed: "user-37", name: "Panjabi Man", gender: "male", image: require("../assets/avatars/panjabi-man.png") },
  { seed: "user-38", name: "Pilot", gender: "male", image: require("../assets/avatars/pilot.png") },
  { seed: "user-39", name: "Pilot 2", gender: "male", image: require("../assets/avatars/pilot-2.png") },
  { seed: "user-40", name: "Policeman", gender: "male", image: require("../assets/avatars/policeman.png") },
  { seed: "user-41", name: "Senior Businessman", gender: "male", image: require("../assets/avatars/senior-businessman.png") },
  { seed: "user-42", name: "Showman", gender: "male", image: require("../assets/avatars/showman.png") },
  { seed: "user-43", name: "Sikh Guru", gender: "male", image: require("../assets/avatars/sikh-guru-avatar.png") },
  { seed: "user-44", name: "Singer", gender: "male", image: require("../assets/avatars/singer.png") },
  { seed: "user-45", name: "Soccer Player", gender: "male", image: require("../assets/avatars/soccer-player-avatar.png") },
  { seed: "user-46", name: "Soldier", gender: "male", image: require("../assets/avatars/soldier-avatar-icon.png") },
  { seed: "user-47", name: "Thief", gender: "male", image: require("../assets/avatars/thief.png") },
  { seed: "user-48", name: "Thief Man", gender: "male", image: require("../assets/avatars/thief-man.png") },
  { seed: "user-49", name: "Young Boy", gender: "male", image: require("../assets/avatars/young-boy.png") },
  { seed: "user-50", name: "Actress", gender: "female", image: require("../assets/avatars/actress.png") },
  { seed: "user-51", name: "Baby Sitter", gender: "female", image: require("../assets/avatars/baby-sitter.png") },
  { seed: "user-52", name: "Business Woman", gender: "female", image: require("../assets/avatars/business-woman.png") },
  { seed: "user-53", name: "Cleopatra", gender: "female", image: require("../assets/avatars/cleopatra-avatar.png") },
  { seed: "user-54", name: "Cleopatra 2", gender: "female", image: require("../assets/avatars/cleopatra-avatar-2.png") },
  { seed: "user-55", name: "Female Characters", gender: "female", image: require("../assets/avatars/female-characters.png") },
  { seed: "user-56", name: "Female Characters 2", gender: "female", image: require("../assets/avatars/female-characters-2.png") },
  { seed: "user-57", name: "Female Florist", gender: "female", image: require("../assets/avatars/female-florist.png") },
  { seed: "user-58", name: "Female Waiter", gender: "female", image: require("../assets/avatars/female-waiter-avatar.png") },
  { seed: "user-59", name: "Girl", gender: "female", image: require("../assets/avatars/girl-avatar.png") },
  { seed: "user-60", name: "Long Hair Woman", gender: "female", image: require("../assets/avatars/long-hair-woman-with-glasses.png") },
  { seed: "user-61", name: "Saleswoman", gender: "female", image: require("../assets/avatars/saleswoman.png") },
  { seed: "user-62", name: "Woman Hijab", gender: "female", image: require("../assets/avatars/woman-with-hijab.png") },
  { seed: "user-63", name: "Women with Glasses", gender: "female", image: require("../assets/avatars/women-with-glasses-avatar.png") },
  { seed: "user-64", name: "Astronout", gender: "female", image: require("../assets/avatars/astronout.png") },
];

export const MALE_USER_2D_AVATARS: UserAvatarPreset[] = USER_2D_AVATARS.filter(
  (avatar) => avatar.gender === "male",
);
export const FEMALE_USER_2D_AVATARS: UserAvatarPreset[] = USER_2D_AVATARS.filter(
  (avatar) => avatar.gender === "female",
);

export const DEFAULT_USER_2D_AVATAR_SEED = USER_2D_AVATARS[0]?.seed ?? 'user-1';

/** Catalog seed, or a stable `user-N` hashed from any other id (UUID, org-mutual-0). */
export function stableUser2DAvatarSeed(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (s && USER_2D_AVATARS.some((avatar) => avatar.seed === s)) return s;
  const key = s || "?";
  let n = 0;
  for (let i = 0; i < key.length; i += 1) {
    n = (n * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (
    USER_2D_AVATARS[n % USER_2D_AVATARS.length]?.seed ?? DEFAULT_USER_2D_AVATAR_SEED
  );
}

export function getUser2DAvatarUriForSeed(seed: string): string | null {
  const preset = USER_2D_AVATARS.find(
    (a) => a.seed === stableUser2DAvatarSeed(seed),
  );
  return preset ? getPresetAvatarUri(preset) : null;
}

export function getUser2DPresetImageSourceForSeed(seed: string): ImageSourcePropType | null {
  const preset = USER_2D_AVATARS.find(
    (a) => a.seed === stableUser2DAvatarSeed(seed),
  );
  return preset ? preset.image : null;
}
