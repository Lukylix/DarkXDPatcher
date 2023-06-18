import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { existsSync, readFileSync, writeFileSync } from "fs";

const xmlLight = readFileSync("./General.xaml", "utf8");
const xmlDark = readFileSync("./dark.xaml", "utf8");
const options = {
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	allowBooleanAttributes: true,
	alwaysCreateTextNode: true,
	preserveOrder: true,
	format: true,
};
const isAlphaAtStart = true;
const parser = new XMLParser(options);
const builder = new XMLBuilder(options);

let lightTheme = parser.parse(xmlLight);
let darkTheme = parser.parse(xmlDark);

const validateHex = (hex) => {
	hex = hex.indexOf("#") === 0 ? hex.slice(1) : hex;
	hex = isAlphaAtStart ? hex.slice(2, 8) + hex.slice(0, 2) : hex;
	return /^([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(hex);
};

function padZero(str) {
	return str.length === 1 ? "0" + str : str;
}
const hexToRgba = (hex) => {
	hex = hex.indexOf("#") === 0 ? hex.slice(1) : hex;
	if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	if (hex.length % 2 !== 0) hex = hex.slice(0, hex.length - 1);
	hex = hex.length === 8 && isAlphaAtStart ? hex.slice(2, 8) + hex.slice(0, 2) : hex;
	const r = parseInt(hex.slice(0, 2), 16),
		g = parseInt(hex.slice(2, 4), 16),
		b = parseInt(hex.slice(4, 6), 16),
		a = parseInt(hex.slice(6, 8), 16) || 255;

	return [r, g, b, a];
};

const isColorGrey = (...colorChannels) => {
	const tresholdMin = (colorChannels.reduce((acc, c) => acc + c, 0) / colorChannels.length) * (1 - 0.05);
	const tresholdMax = (colorChannels.reduce((acc, c) => acc + c, 0) / colorChannels.length) * (1 + 0.05);

	for (const colorChannel of colorChannels) {
		if (colorChannel < tresholdMin || colorChannel > tresholdMax) return false;
	}

	return true;
};

const isNearWhite = (color) => {
	if (!validateHex(color)) {
		const nearWhiteNames = [
			"white",
			"snow",
			"aliceblue",
			"beige",
			"antiquewhite",
			"bisque",
			"blanchedalmond",
			"cornslik",
			"florawhite",
			"ghostwhite",
			"honeydew",
			"ivory",
			"lavenderblush",
			"linen",
			"mintcream",
			"mistyrose",
			"moccasin",
			"navajowhite",
			"oldlace",
			"papayawhip",
			"peachpuff",
			"seashell",
			"thistle",
		];
		if (nearWhiteNames.find((white) => color.includes("white"))) return true;
		return false;
	}
	const [r, g, b, a] = hexToRgba(color);
	const moyRgb = (r + g + b) / 3;
	if (isColorGrey(r, g, b) && moyRgb > 200) return true;
	return false;
};

const isNearBlack = (color) => {
	const [r, g, b, a] = hexToRgba(color);
	const moyRgb = (r + g + b) / 3;

	if (isColorGrey(r, g, b) && moyRgb <= 50) {
		return true;
	}
	return false;
};

const capColors = (...colorsChanells) => {
	colorsChanells = colorsChanells.map((colorChannel) => {
		if (colorChannel < 0) return 0;
		if (colorChannel > 255) return 255;
		return colorChannel;
	});
	return colorsChanells;
};

const buildHex = (r, g, b, a = "") => {
	if (Array.isArray(r)) [r, g, b, a] = r;
	[r, g, b, a] = capColors(r, g, b, a);
	r = padZero(r.toString(16));
	g = padZero(g.toString(16));
	b = padZero(b.toString(16));
	a = padZero(a.toString(16));
	if (a) return isAlphaAtStart ? "#" + a + r + g + b : "#" + r + g + b + a;
	return "#" + r + g + b;
};

const invertColor = (color) => {
	let [r, g, b, a] = hexToRgba(color);
	r = 255 - r + 30;
	g = 255 - g + 30;
	b = 255 - b + 30;

	const invertedHex = buildHex(r, g, b, a);
	if (validateHex(invertedHex)) {
		return invertedHex;
	}
	return "#262626";
};

const searchForColors = (obj) => {
	let colors = [];
	for (const key in obj) {
		if (key === "Color") {
			colors.push({ ...obj[":@"], "#text": obj[key][0]["#text"] });
		} else if (typeof obj[key] === "object") {
			colors = [...colors, ...searchForColors(obj[key])];
		}
	}
	colors = colors.filter((color) => {
		const sameColorIds = colors
			.filter((color2) => color2["@_x:Key"] === color["@_x:Key"])
			.map((color) => color["#text"].replace("#", ""));
		return sameColorIds[0];
	});
	return colors;
};

const colorsLight = searchForColors(lightTheme);
const colorsDark = searchForColors(darkTheme);
const colorsReamining = colorsLight.filter(
	(color) =>
		!colorsDark.find((colorDark) =>
			Object.keys(colorDark)
				.filter((key) => key !== "#text")
				.every((key) => color[key] === colorDark[key])
		)
);

const replaceColors = (obj, colors) => {
	for (const key in obj) {
		if (key === "Color") {
			let darkColorObj = colors.find((color) => {
				return Object.keys(obj[":@"]).every((key) => color[key] === obj[":@"][key]);
			});

			if (darkColorObj) {
				obj[key] = [{ "#text": darkColorObj["#text"] }];
			}
		} else if (typeof obj[key] === "object") {
			obj[key] = replaceColors(obj[key], colors);
		}
	}
	return obj;
};

const lightenColor = (color, power) => {
	let [r, g, b, a] = hexToRgba(color);

	r = r + power;
	g = g + power;
	b = b + power;

	let lightenColor = buildHex(r, g, b, a);
	const isValidHex = validateHex(lightenColor);
	return isValidHex ? lightenColor : color;
};

const darkThemeObj = replaceColors(lightTheme, colorsDark);

const darkThemeFinalColors = colorsReamining.map((color) => {
	if (isNearWhite(color["#text"]) && !color["@_x:Key"].toLowerCase().match(/text|title|label/g))
		return { ...color, "#text": invertColor(color["#text"]) };
	return color;
});

const darkThemeFinalObj = replaceColors(darkThemeObj, darkThemeFinalColors);
const colorsDarkFinal = searchForColors(darkThemeFinalObj);

const darkThemeFinalReamaningColors = colorsDarkFinal
	.filter(
		(color) =>
			isNearWhite(color["#text"]) &&
			(!color["@_x:Key"].toLowerCase().match(/text|title|label|grey|gray|hover|normal|white|foreground/g) ||
				color["@_x:Key"].toLowerCase().match(/background|border|fill/g))
	)
	.map((color) => ({ ...color, "#text": invertColor(color["#text"]) }));

const darkThemePatchedObj = replaceColors(darkThemeFinalObj, darkThemeFinalReamaningColors);

const xmlContent = builder.build(darkThemePatchedObj);

writeFileSync("./output.xaml", xmlContent, "utf8");

const blackThemeColors = searchForColors(darkThemePatchedObj).map((color) =>
	isNearBlack(color["#text"]) ? { ...color, "#text": "#000000" } : color
);

const blackThemeObj = replaceColors(darkThemePatchedObj, blackThemeColors);

const xmlContentBlack = builder.build(blackThemeObj);

writeFileSync("./outputBlack.xaml", xmlContentBlack, "utf8");
