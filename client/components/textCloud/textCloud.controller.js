'use strict';

/*
 * Copyright 2016 Next Century Corporation
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

angular.module('neonDemo.directives').controller('textCloudController',
['$scope', 'external', 'LinksPopupService', 'TranslationService', '$timeout', function($scope, external, linksPopupService, translationService, $timeout) {
    $scope.active.dataField = {};
    $scope.active.andFilters = true;
    $scope.active.limit = 40;

    $scope.active.data = [];
    $scope.active.linksPopupButtonIsDisabled = true;
    $scope.active.showTranslation = false;
    $scope.active.textColor = "#111";

    $scope.translationAvailable = false;
    $scope.translationLanguages = {
        fromLanguageOptions: {},
        toLanguageOptions: {},
        chosenFromLanguage: "",
        chosenToLanguage: ""
    };

    $scope.functions.onDestroy = function() {
        linksPopupService.deleteLinks($scope.visualizationId);
    };

    $scope.functions.onInit = function() {
        if(translationService.hasKey()) {
            $scope.translationAvailable = true;
            translationService.getSupportedLanguages(getSupportedLanguagesSuccessCallback, translationFailureCallback);
        }

        updateTagcloudPluginSettings();
    };

    /**
     * Sets the 'to' and 'from' language options for translating.
     * @param {Object} languages A mapping of language codes to their names.
     * @method getSupportedLanguagesSuccessCallback
     * @private
     */
    var getSupportedLanguagesSuccessCallback = function(languages) {
        $scope.translationLanguages.fromLanguageOptions = languages;
        $scope.translationLanguages.toLanguageOptions = languages;
    };

    /**
     * Shows an error message when an error occurs in the translation service.
     * @param {Object} response An error response containing the message and reason.
     * @param {String} response.message
     * @param {String} response.reason
     * @method translationFailureCallback
     * @private
     */
    var translationFailureCallback = function(response) {
        /*
        $scope.initializing = false;

        if($scope.errorMessage) {
            errorNotificationService.hideErrorMessage($scope.errorMessage);
            $scope.errorMessage = undefined;
        }
        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.message,  response.reason);
        */
    };

    /**
     * Updates the settings for the tagcloud plugin to use the global text color.
     * @method updateTagcloudPluginSettings
     * @private
     */
    var updateTagcloudPluginSettings = function() {
        $.fn.tagcloud.defaults = {
            size: {
                start: 130,
                end: 250,
                unit: '%'
            },
            color: {
                start: '#aaaaaa',
                end: $scope.active.textColor
            }
        };
    };

    $scope.functions.onUpdateFields = function(datasetService) {
        var dataFieldName = $scope.bindings.dataField || datasetService.getMapping($scope.active.database.name, $scope.active.table.name, neonMappings.TAGS) || "";
        $scope.active.dataField = _.find($scope.fields, function(field) {
            return field.columnName === dataFieldName;
        }) || datasetService.createBlankField();
    };

    $scope.functions.hasValidDataFields = function(datasetService) {
        return datasetService.isFieldValid($scope.active.dataField);
    }

    $scope.functions.executeQuery = function(connection, query) {
        // Note that the where clause must be null, not undefined.
        return connection.executeArrayCountQuery($scope.active.database.name, $scope.active.table.name, $scope.active.dataField.columnName, $scope.active.limit,
                query.filter.whereClause || null);
    };

    $scope.functions.updateData = function(data) {
        if($scope.functions.isFilterSet() && $scope.active.andFilters) {
            data = data.filter(function(item) {
                var index = _.findIndex($scope.filter.data, {
                    value: item.key
                });
                return index === -1;
            });
        }

        $scope.active.data = data.map(function(item) {
            item.keyTranslated = item.key;
            return item;
        });

        if($scope.active.showTranslation) {
            translate();
        }

        updateTextStyle();
    };

    /**
     * Updates the style of the text in this visualization using the tagcloud plugin.
     * @method updateTextStyle
     * @private
     */
    var updateTextStyle = function() {
        $timeout(function() {
            var text = $scope.element.find('.text');
            $scope.element.find('.text').tagcloud();
        });
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    /**
     * Adds a filter on the given text.
     * @param {String} text
     * @param {String} translatedText
     * @method addFilter
     */
    $scope.addFilter = function(text, translatedText) {
        $scope.functions.addFilter({
            field: $scope.active.dataField.columnName,
            value: text,
            translated: translatedText
        });
    };

    // TODO Remove the need for the Dataset Service
    $scope.functions.onAddFilter = function(item, datasetService) {
        var mappings = datasetService.getMappings($scope.active.database.name, $scope.active.table.name);
        var cloudLinks = linksPopupService.createAllServiceLinkObjects(external.services, mappings, item.field, item.value);
        linksPopupService.addLinks($scope.visualizationId, linksPopupService.generateKey($scope.active.dataField, item.value), cloudLinks);
        $scope.active.linksPopupButtonIsDisabled = !cloudLinks.length;

        item.translated = item.translated || item.value;
        return item;
    };

    $scope.functions.onRemoveFilter = function(item) {
        if(item) {
            linksPopupService.removeLinksForKey($scope.visualizationId, linksPopupService.generateKey($scope.active.dataField, item.value));
        } else {
            linksPopupService.deleteLinks($scope.visualizationId);
        }
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        var filterClauses = $scope.filter.data.map(function(item) {
            return neon.query.where(fieldName, "=", item.value);
        });
        if(filterClauses.length === 1) {
            return filterClauses[0];
        }
        if($scope.active.andFilters) {
            return neon.query.and.apply(neon.query, filterClauses);
        }
        return neon.query.or.apply(neon.query, filterClauses);
    };

    $scope.functions.getFilterableFields = function() {
        return [$scope.active.dataField];
    };

    $scope.functions.createFilterText = function() {
        return (_.pluck($scope.filter.data, ($scope.active.showTranslation ? "translated" : "value"))).join(", ");
    }

    $scope.handleChangeDataField = function() {
        $scope.functions.handleChangeField("data-field", $scope.active.dataField.columnName);
    };

    $scope.handleChangeAndFilters = function() {
        $scope.functions.handleChangeField("and-filters", $scope.active.andFilters);
    };

    /**
     * Updates the 'from' language on translation and translates if 'Show Translation' is checked
     * @param {String} language The 'from' translation language to change to
     * @method handleChangeFromLanguage
     */
    $scope.handleChangeFromLanguage = function(language) {
        XDATA.userALE.log({
            activity: "select",
            action: "click",
            elementId: "textCloudOptions",
            elementType: "combobox",
            elementSub: "targetTranslationLanguage",
            elementGroup: "chart_group",
            source: "user",
            tags: ["options", "textCloud"]
        });
        $scope.translationLanguages.chosenFromLanguage = language;

        if($scope.active.showTranslation) {
            translate();
        }
    };

    /**
     * Updates the 'to' language on translation and translates if 'Show Translation' is checked
     * @param {String} language The 'to' translation language to change to
     * @method handleChangeToLanguage
     */
    $scope.handleChangeToLanguage = function(language) {
        XDATA.userALE.log({
            activity: "select",
            action: "click",
            elementId: "textCloudOptions",
            elementType: "combobox",
            elementSub: "targetTranslationLanguage",
            elementGroup: "chart_group",
            source: "user",
            tags: ["options", "textCloud"]
        });
        $scope.translationLanguages.chosenToLanguage = language;

        if($scope.active.showTranslation) {
            translate();
        }
    };

    /**
     * Translates all text back to its original form if checked is false, or to the specified 'to' language
     * if checked is true.
     * @param {Boolean} checked Whether 'Show Translation' is checked or unchecked
     * @param {String} fromLang The 'from' language to use for translation
     * @param {String} toLang The 'to' language to use for translation
     * @method updateTranslation
     */
    $scope.updateTranslation = function(checked, fromLang, toLang) {
        XDATA.userALE.log({
            activity: "select",
            action: "click",
            elementId: "textCloudOptions",
            elementType: "button",
            elementSub: (checked) ? "showTranslation" : "removeTranslation",
            elementGroup: "chart_group",
            source: "user",
            tags: ["options", "textCloud"]
        });

        $scope.active.showTranslation = checked;

        if(checked) {
            $scope.translationLanguages.chosenFromLanguage = fromLang;
            $scope.translationLanguages.chosenToLanguage = toLang;
            translate();
        } else {
            resetTranslation();
        }
    };

    /**
     * Translates all tags and filter tags with the from/to languages specified.
     * @method translate
     * @private
     */
    var translate = function() {
        /*
        $scope.initializing = true;

        if($scope.errorMessage) {
            errorNotificationService.hideErrorMessage($scope.errorMessage);
            $scope.errorMessage = undefined;
        }
        */

        var dataKeys = $scope.active.data.map(function(item) {
            return item.key;
        });

        if($scope.functions.isFilterSet()) {
            $scope.filter.data.forEach(function(item) {
                dataKeys.push(item.value);
            });
        }

        translationService.translate(dataKeys, $scope.translationLanguages.chosenToLanguage,
            translateSuccessCallback, translationFailureCallback, $scope.translationLanguages.chosenFromLanguage);
    };

    /**
     * Refreshes all data and filter tags with their new translations.
     * @param {Object} response Response object containing all the translations.
     * @param {Array} response.data.data.translations List of all translations. It's assumed that
     * all translations are given in the order the original text to translate was received in.
     * @param {String} response.data.data.translations[].translatedText
     * @param {String} [response.data.data.translations[].detectedSourceLanguage] Detected language
     * code of the original version of translatedText. Only provided if the source language was auto-detected.
     * @method translateSuccessCallback
     * @private
     */
    var translateSuccessCallback = function(response) {
        /*
        $scope.initializing = false;
        */

        response.data.data.translations.forEach(function(elem, index) {
            if(index < $scope.active.data.length) {
                $scope.active.data[index].keyTranslated = elem.translatedText;
            } else {
                $scope.filter.data[index - $scope.active.data.length].translated = elem.translatedText;
            }
        });

        translationService.saveTranslationCache();
    };

    /**
     * Resets all tags and filter tags to its original text.
     * @method resetTranslation
     * @private
     */
    var resetTranslation = function() {
        $scope.active.data = $scope.active.data.map(function(elem) {
            elem.keyTranslated = elem.key;
            return elem;
        });

        if($scope.functions.isFilterSet()) {
            $scope.filter.data = _.map($scope.filter.data, function(item) {
                item.translated = item.value;
                return item;
            });
        }

        $scope.translationLanguages.chosenFromLanguage = "";
        $scope.translationLanguages.chosenToLanguage = "";
    };

    $scope.functions.createExportDataObject = function(query) {
        var finalObject = {
            name: "Tag_Cloud",
            data: [{
                database: $scope.active.database.name,
                table: $scope.active.table.name,
                field: $scope.active.dataField.columnName,
                limit: $scope.active.limit,
                name: "tagCloud-" + $scope.exportID,
                fields: [],
                type: "arraycount"
            }]
        };
        finalObject.data[0].fields.push({
            query: "key",
            pretty: "Key"
        });
        finalObject.data[0].fields.push({
            query: "count",
            pretty: "Count"
        });
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        // TODO Update to use the new binding system.
        bindings["bind-tag-field"] = ($scope.active.dataField && $scope.active.dataField.columnName) ? "'" + $scope.active.dataField.columnName + "'" : undefined;
        return bindings;
    };

    /**
     * Generates and returns the links popup key for this visualization.
     * @method generateLinksPopupKey
     * @return {String}
     */
    $scope.generateLinksPopupKey = function(value) {
        return linksPopupService.generateKey($scope.active.dataField, value);
    };

    $scope.functions.onThemeChanged = function(theme) {
        if(theme.accentColor !== $scope.active.textColor) {
            $scope.active.textColor = theme.accentColor;
            updateTagcloudPluginSettings();
            updateTextStyle();
            return true;
        }
        return false;
    };

    $scope.functions.createMenuText = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.data.length ? "No Data" : "";
    };

    $scope.functions.showMenuText = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.data.length;
    };
}]);
