'use strict';
/*
 * Copyright 2013 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var charts = charts || {};
var mediators = mediators || {};

var neonColors = neonColors || {};
neonColors.GREEN = '#39b54a';
neonColors.RED = '#C23333';
neonColors.BLUE = '#3662CC';
neonColors.ORANGE = "#ff7f0e";
neonColors.PURPLE = "#9467bd";
neonColors.BROWN = "#8c564b";
neonColors.PINK = "#e377c2";
neonColors.GRAY = "#7f7f7f";
neonColors.YELLOW = "#bcbd22";
neonColors.CYAN = "#17becf";
neonColors.LIGHT_GREEN = "#98df8a";
neonColors.LIGHT_RED = "#ff9896";
neonColors.LIGHT_BLUE = "#aec7e8";
neonColors.LIGHT_ORANGE = "#ffbb78";
neonColors.LIGHT_PURPLE = "#c5b0d5";
neonColors.LIGHT_BROWN = "#c49c94";
neonColors.LIGHT_PINK = "#f7b6d2";
neonColors.LIGHT_GRAY = "#c7c7c7";
neonColors.LIGHT_YELLOW = "#dbdb8d";
neonColors.LIGHT_CYAN = "#9edae5";
neonColors.LIST = [
    neonColors.GREEN,
    neonColors.RED,
    neonColors.BLUE,
    neonColors.ORANGE,
    neonColors.PURPLE,
    neonColors.BROWN,
    neonColors.PINK,
    neonColors.GRAY,
    neonColors.YELLOW,
    neonColors.CYAN,
    neonColors.LIGHT_GREEN,
    neonColors.LIGHT_RED,
    neonColors.LIGHT_BLUE,
    neonColors.LIGHT_ORANGE,
    neonColors.LIGHT_PURPLE,
    neonColors.LIGHT_BROWN,
    neonColors.LIGHT_PINK,
    neonColors.LIGHT_GRAY,
    neonColors.LIGHT_YELLOW,
    neonColors.LIGHT_CYAN
];
neonColors.DEFAULT = neonColors.GRAY;

var translationLanguages = translationLanguages || {};
translationLanguages.google = translationLanguages.google || {
    "af": "Afrikaans",
    "sq": "Albanian",
    "ar": "Arabic",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "ny": "Chichewa",
    "zh-CN": "Chinese Simplified",
    "h-TW": "Chinese Traditional",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "tl": "Filipino",
    "fi": "Finnish",
    "fr": "French",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "ht": "Haitian Creole",
    "ha": "Hausa",
    "iw": "Hebrew",
    "hi": "Hindi",
    "hmn": "Hmong",
    "hu": "Hungarian",
    "is": "Icelandic",
    "ig": "Igbo",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "jw": "Javanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "km": "Khmer",
    "ko": "Korean",
    "lo": "Lao",
    "la": "Latin",
    "lv": "Latvian",
    "lt": "Lithuanian",
    "mk": "Macedonian",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mi": "Maori",
    "mr": "Marathi",
    "mn": "Mongolian",
    "my": "Myanmar (Burmese)",
    "ne": "Nepali",
    "no": "Norwegian",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "ma": "Punjabi",
    "ro": "Romanian",
    "ru": "Russian",
    "sr": "Serbian",
    "st": "Sesotho",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "es": "Spanish",
    "su": "Sudanese",
    "sw": "Swahili",
    "sv": "Swedish",
    "tg": "Tajik",
    "ta": "Tamil",
    "te": "Telugu",
    "th": "Thai",
    "tr": "Turkish",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "zu": "Zulu"
};