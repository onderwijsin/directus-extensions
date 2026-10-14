const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Languages listed in Mapbox Geocoding language coverage, displayed by name. */
export const languageChoices =
	'ar az bn bs ca cs da de el en es et fa fi fr ga he hi hu id is it ja ka kk km ko lo lt lv mk mn ms my nb nl pl pt ro ru sk sl sq sr sv te th tk tl tr uk vi zh zh-Hans zh-Hant zh-TW'
		.split(' ')
		.map((value) => ({ text: languageNames.of(value) ?? value, value }))
		.sort((a, b) => a.text.localeCompare(b.text))

/** ISO 3166-1 alpha-2 countries and territories for Mapbox country restrictions. */
export const countryChoices = [
	{ text: 'United States', value: 'US' },
	{ text: 'Netherlands', value: 'NL' },
	...'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
		.split(' ')
		.map((value) => ({ text: countryNames.of(value) ?? value, value }))
		.sort((a, b) => a.text.localeCompare(b.text)),
]
