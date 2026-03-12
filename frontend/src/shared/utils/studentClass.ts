export const CLASS_GROUP_DELIMITER = "::";

export type ParsedStudentClass = {
  className: string;
  groupName: string;
};

export const parseStudentClass = (value: string): ParsedStudentClass => {
  const raw = value.trim();
  if (!raw) {
    return { className: "", groupName: "" };
  }

  const [classPart, ...groupParts] = raw.split(CLASS_GROUP_DELIMITER);
  if (groupParts.length === 0) {
    return { className: classPart.trim(), groupName: "" };
  }

  return {
    className: classPart.trim(),
    groupName: groupParts.join(CLASS_GROUP_DELIMITER).trim(),
  };
};

export const composeStudentClass = (className: string, groupName: string): string => {
  const classPart = className.trim();
  const groupPart = groupName.trim();
  if (!groupPart) {
    return classPart;
  }
  return `${classPart}${CLASS_GROUP_DELIMITER}${groupPart}`;
};

export const formatStudentClass = (value: string): string => {
  const parsed = parseStudentClass(value);
  if (!parsed.groupName) {
    return parsed.className;
  }
  return `${parsed.className} / ${parsed.groupName}`;
};
