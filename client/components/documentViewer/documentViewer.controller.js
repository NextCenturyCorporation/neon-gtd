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

/**
 * This visualization shows annotated and filterable text data.
 * @namespace neonDemo.controllers
 * @class documentViewerController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('documentViewerController', ['$scope', function($scope) {
    $scope.active.documentTextField = {};
    $scope.active.annotations = [];
    $scope.active.annotationsInAnotherTable = $scope.bindings.annotationsInAnotherTable || false;
    $scope.active.annotationDatabase = {};
    $scope.active.annotationTable = {};
    $scope.active.annotationFields = [];
    $scope.active.documentIdFieldInAnnotationTable = {};
    $scope.active.documentIdFieldInDocumentTable = {};
    $scope.active.documentLimit = $scope.bindings.documentLimit || 50;
    $scope.active.documents = [];
    $scope.active.details = [];

    // Override the default in the superclass because we need to reference the original text for the character indices.
    // This visualization will escape the text data itself before the text is shown.
    $scope.active.escapeData = false;

    // Annotation highlight colors.
    var HIGHLIGHT_COLORS = [
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
    var DEFAULT_HIGHLIGHT_COLOR = neonColors.LIGHT_GREEN;
    var OTHER_HIGHLIGHT_COLOR = neonColors.LIGHT_GRAY;

    $scope.functions.onUpdateFields = function() {
        $scope.active.documentTextField = $scope.functions.findFieldObject("documentTextField");
        updateAnnotationDatabase();
    };

    var updateAnnotationDatabase = function() {
        $scope.active.annotationDatabase = ($scope.bindings.annotationDatabase ? _.find($scope.active.databases, function(database) {
            return database.name === $scope.bindings.database;
        }) : undefined) || $scope.active.databases[0];
        updateAnnotationTable();
    };

    var updateAnnotationTable = function() {
        $scope.active.annotationTable = ($scope.bindings.annotationTable ? _.find($scope.active.tables, function(table) {
            return table.name === $scope.bindings.table;
        }) : undefined) || $scope.active.tables[0];

        updateAnnotationFields();
    };

    var updateAnnotationFields = function() {
        $scope.active.annotationFields = $scope.functions.getSortedFields($scope.active.annotationDatabase, $scope.active.annotationTable);
        $scope.active.documentIdFieldInAnnotationTable = ($scope.bindings.documentIdFieldInAnnotationTable ? _.find($scope.active.annotationFields, function(field) {
            return field.columnName === $scope.bindings.documentIdFieldInAnnotationTable;
        }) : undefined) || $scope.functions.createBlankField();
        $scope.active.documentIdFieldInDocumentTable = ($scope.bindings.documentIdFieldInDocumentTable ? _.find($scope.active.annotationFields, function(field) {
            return field.columnName === $scope.bindings.documentIdFieldInDocumentTable;
        }) : undefined) || $scope.functions.createBlankField();

        $scope.active.annotations = [];
        ($scope.bindings.annotations || []).forEach(function(annotation) {
            $scope.active.annotations.push({
                startField: findFieldInFieldList(annotation.startField, $scope.active.annotationFields),
                endField: findFieldInFieldList(annotation.endField, $scope.active.annotationFields),
                textField: findFieldInFieldList(annotation.textField, $scope.active.annotationFields),
                typeField: findFieldInFieldList(annotation.typeField, $scope.active.annotationFields),
                label: annotation.label || ""
            });
        });

        $scope.active.details = [];
        ($scope.bindings.details || []).forEach(function(detail) {
            $scope.active.details.push({
                field: findFieldInFieldList(detail.field, $scope.active.annotationFields),
                label: detail.label || ""
            });
        });
    };

    var findFieldInFieldList = function(fieldName, fieldList) {
        return _.find(fieldList, function(field) {
            return field.columnName === fieldName;
        }) || $scope.functions.createBlankField();
    };

    $scope.functions.areDataFieldsValid = function() {
        var validDocumentIdField = ($scope.active.annotationsInAnotherTable ? $scope.functions.isFieldValid($scope.active.documentIdFieldInDocumentTable) : true);
        return $scope.functions.isFieldValid($scope.active.documentTextField) && validDocumentIdField;
    };

    $scope.functions.addToQuery = function(query, unsharedFilterWhereClause) {
        var fields = [$scope.active.documentTextField.columnName];
        // FIXME NEON-1986
        if($scope.active.annotationsInAnotherTable) {
            fields.push($scope.active.documentIdFieldInDocumentTable.columnName);
        }

        var whereClause = neon.query.where($scope.active.documentTextField.columnName, "!=", null);
        return query.where(unsharedFilterWhereClause ? neon.query.and(whereClause, unsharedFilterWhereClause) : whereClause)
            .withFields(fields)
            .groupBy($scope.active.documentTextField.columnName)
            .aggregate(neon.query.COUNT, "*", "count")
            .sortBy("count", neon.query.DESCENDING)
            .limit($scope.active.documentLimit)
            .enableAggregateArraysByElement();
    };

    $scope.functions.updateData = function(data) {
        $scope.active.documents = [];
        $scope.queryDocumentLimit = $scope.active.documentLimit;
        if(data) {
            data.forEach(function(dataItem) {
                // A document object contains the raw document text value, the document text (content) as a string, a document count, a list of annotation objects (different from
                // $scope.active.annotations) for each annotation and its types present in the document, a list of detail objects for the details of the document, a list of letter
                // objects for each letter in the document content, and a list of part objects (both annotations and non-annotations) that form the full annotated document content.
                var document = {
                    raw: findDocumentRawText(dataItem),
                    content: findDocumentContent(dataItem),
                    count: dataItem.count,
                    annotations: [],
                    details: [],
                    letters: [],
                    parts: []
                };

                document.content.split('').forEach(function(letter) {
                    // A letter object contains a letter and a list of mention objects for each mention starting at the letter.
                    document.letters.push({
                        letter: letter,
                        mentions: []
                    });
                });

                $scope.active.documents.push(document);
            });

            $scope.queryAndUpdateAnnotations();
        }
    };

    /**
     * Returns the raw document text value in the given data item.
     * @method findDocumentRawText
     * @param {Object} dataItem
     * @return {Array | String}
     * @private
     */
    var findDocumentRawText = function(dataItem) {
        var text = neon.helpers.getNestedValues(dataItem, [$scope.active.documentTextField.columnName]).map(function(value) {
            return value[$scope.active.documentTextField.columnName];
        });
        return text.length > 1 ? text : text[0];
    };

    /**
     * Returns the document text value in the given data item as a content string.
     * @method findDocumentContent
     * @param {Object} dataItem
     * @return {String}
     * @private
     */
    var findDocumentContent = function(dataItem) {
        var text = neon.helpers.getNestedValues(dataItem, [$scope.active.documentTextField.columnName]).map(function(value) {
            return value[$scope.active.documentTextField.columnName];
        });
        // If the document text field contains an array, arbitrarily join the elements of the array to create the content.
        return _.escape(text.length > 1 ? text.join('') : text[0]);
    };

    $scope.queryAndUpdateAnnotations = function() {
        // Check to see if the annotation definitions include at least one valid annotation.
        var validAnnotations = $scope.active.annotations.some(function(annotation) {
            return $scope.functions.isFieldValid(annotation.startField) && $scope.functions.isFieldValid(annotation.endField);
        });

        var validFields = $scope.active.annotationsInAnotherTable ? ($scope.functions.isFieldValid($scope.active.documentIdFieldInAnnotationTable) &&
                $scope.functions.isFieldValid($scope.active.documentIdFieldInDocumentTable)) : $scope.functions.isFieldValid($scope.active.documentTextField);

        if(validAnnotations && validFields && $scope.active.documents.length) {
            $scope.functions.queryAndUpdate({
                addToQuery: addToAnnotationQuery,
                updateData: updateAnnotationData
            });
        }
    };

    /**
     * Adds options to the given Neon query and returns the query.
     * @method addToAnnotationQuery
     * @param {neon.query.Query} query
     * @param {neon.query.WhereClause} unsharedFilterWhereClause
     * @return {neon.query.Query}
     * @private
     */
    var addToAnnotationQuery = function(query, unsharedFilterWhereClause) {
        // Replace the database and table names set in the visualization superclass with the annotation database and table if they are different.
        if($scope.active.annotationsInAnotherTable) {
            query.selectFrom($scope.active.annotationDatabase.name, $scope.active.annotationTable.name);
        }

        var annotations = getValidAnnotations();
        var filterWhereClauses = annotations.map(function(annotation) {
            return neon.query.and(neon.query.where(annotation.startField.columnName, "!=", null), neon.query.where(annotation.endField.columnName, "!=", null));
        });

        var documentWhereClauses = $scope.active.documents.map(function(document) {
            return neon.query.where($scope.active.documentTextField.columnName, "=", document.raw);
        });

        var filterWhereClause = (filterWhereClauses.length > 1 ? neon.query.or.apply(neon.query, filterWhereClauses) : filterWhereClauses[0]);
        var documentWhereClause = (documentWhereClauses.length > 1 ? neon.query.or.apply(neon.query, documentWhereClauses) : documentWhereClauses[0]);
        query.where(unsharedFilterWhereClause ? neon.query.and(filterWhereClause, documentWhereClause, unsharedFilterWhereClause) : neon.query.and(filterWhereClause, documentWhereClause));

        var fields = $scope.active.annotationsInAnotherTable ? [$scope.active.documentIdFieldInAnnotationTable.columnName] : [$scope.active.documentTextField.columnName];
        annotations.forEach(function(annotation) {
            fields.push(annotation.startField.columnName);
            fields.push(annotation.endField.columnName);
            if($scope.functions.isFieldValid(annotation.textField)) {
                fields.push(annotation.textField.columnName);
            }
            if($scope.functions.isFieldValid(annotation.typeField)) {
                fields.push(annotation.typeField.columnName);
            }
        });

        getValidDetails().forEach(function(detail) {
            fields.push(detail.field.columnName);
        });

        return query.withFields(fields);
    };

    /**
     * Returns the list of valid annotation definitions for this visualization.
     * @method getValidAnnotations
     * @return {Array}
     * @private
     */
    var getValidAnnotations = function() {
        return $scope.active.annotations.filter(function(annotation) {
            return $scope.functions.isFieldValid(annotation.startField) && $scope.functions.isFieldValid(annotation.endField);
        });
    };

    /**
     * Returns the list of valid detail definitions for this visualization.
     * @method getValidDetails
     * @return {Array}
     * @private
     */
    var getValidDetails = function() {
        return $scope.active.details.filter(function(detail) {
            return $scope.functions.isFieldValid(detail.field);
        });
    };

    /**
     * Updates the annotation data for this visualization using the given query result data.
     * @method updateAnnotationData
     * @param {Array} data
     * @private
     */
    var updateAnnotationData = function(data) {
        $scope.active.documents.forEach(function(document) {
            document.showAnnotationsLegend = false;
            document.showDetailsList = false;
            document.annotations = [];
            document.details = [];
            document.parts = [];
            document.letters.forEach(function(letter) {
                letter.mentions = [];
            });
        });

        if(data) {
            setDefaultAnnotationAndDetailNames();

            data.forEach(function(dataItem) {
                var document = findDocument(dataItem);

                if(document) {
                    dataItem = neon.helpers.escapeDataRecursively(dataItem);
                    saveAnnotations(dataItem, document);
                    saveDetails(dataItem, document);
                }
            });

            $scope.active.documents.forEach(function(document) {
                createDisplayObjects(document);
            });
        }
    };

    /**
     * Sets the default names for the unnamed annotation and detail definitions for this visualization.
     * @method setDefaultAnnotationAndDetailNames
     * @private
     */
    var setDefaultAnnotationAndDetailNames = function() {
        getValidAnnotations().forEach(function(annotation, index) {
            annotation.label = annotation.label || ("Annotation " + (index + 1));
        });
        getValidDetails().forEach(function(detail, index) {
            detail.label = detail.label || ("Detail " + (index + 1));
        });
    };

    /**
     * Finds and returns the document from the global list of documents that matches the given data item using the document text (or undefined if no such document exists).
     * @method findDocument
     * @param {Object} dataItem
     * @return {Object}
     * @private
     */
    var findDocument = function(dataItem) {
        var document;
        if($scope.active.annotationsInAnotherTable) {
            // TODO Handle coreferencing documents and annotations in different tables.
        } else {
            var content = findDocumentContent(dataItem);
            document = _.find($scope.active.documents, function(document) {
                return document.content === content;
            });
        }
        return document;
    };

    /**
     * Saves the annotations and mentions from the given data item in the given document object.
     * @method saveAnnotations
     * @param {Object} dataItem
     * @param {Object} document
     * @private
     */
    var saveAnnotations = function(dataItem, document) {
        getValidAnnotations().forEach(function(annotation) {
            var fields = [annotation.startField.columnName, annotation.endField.columnName];
            if($scope.functions.isFieldValid(annotation.textField)) {
                fields.push(annotation.textField.columnName);
            }
            if($scope.functions.isFieldValid(annotation.typeField)) {
                fields.push(annotation.typeField.columnName);
            }
            var annotationValues = neon.helpers.getNestedValues(dataItem, fields);

            // If this document has any results for this annotation, add an object for this annotation to the list of annotations for this document.
            var annotationIndex = annotationValues.length ? addAnnotationToDocument(annotation, document) : -1;

            // The lists of start and end indices should be equal length but use Math.min to be sure.
            annotationValues.forEach(function(annotationValue) {
                var start = Number(annotationValue[annotation.startField.columnName]);
                var end = Number(annotationValue[annotation.endField.columnName]);
                var text = $scope.functions.isFieldValid(annotation.textField) ? annotationValue[annotation.textField.columnName] : "";
                var type = $scope.functions.isFieldValid(annotation.typeField) ? annotationValue[annotation.typeField.columnName] : "";

                // Add this type to the list of types for this annotation in the list of annotations of this document.
                if(type && annotationIndex >= 0) {
                    addAnnotationTypeToDocumentAnnotation(type, document.annotations[annotationIndex]);
                }

                if(start < end && document.letters.length > Math.max(start, end)) {
                    // A mention object contains an annotation label string, an annotation field object, the color of the mention based on the annotation type, the text of the
                    // mention taken from the document text, the annotation type of the mention, and the index at which the mention ends.
                    document.letters[start].mentions.push({
                        label: annotation.label,
                        field: $scope.functions.isFieldValid(annotation.textField) ? annotation.textField : $scope.active.documentTextField,
                        color: DEFAULT_HIGHLIGHT_COLOR,
                        text: text,
                        type: type,
                        end: end
                    });
                }
            });

            if(annotationIndex >= 0) {
                // Sort the annotation types alphabetically.
                document.annotations[annotationIndex].types.sort(function(a, b) {
                    return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
                });

                updateDocumentAnnotationColors(annotation.typeField, document.annotations[annotationIndex], document.letters);
            }
        });
    };

    /**
     * Adds an annotation object for the given annotation definition to the given document object.
     * @method addAnnotationToDocument
     * @param {Object} annotation
     * @param {Object} document
     * @private
     */
    var addAnnotationToDocument = function(annotation, document) {
        var index = _.findIndex(document.annotations, function(annotationItem) {
            return annotationItem.label === annotation.label;
        });

        if(index < 0) {
            // A document annotation object contains a label string, whether the annotation is shown, and a list of type objects for each unique annotation value.
            document.annotations.push({
                label: annotation.label,
                shown: true,
                types: []
            });
            index = document.annotations.length - 1;
        }

        return index;
    };

    /**
     * Adds the given annotation type to the given document annotation object.
     * @method addAnnotationTypeToDocumentAnnotation
     * @param {String} type
     * @param {Object} annotation
     * @private
     */
    var addAnnotationTypeToDocumentAnnotation = function(type, annotation) {
        var index = _.findIndex(annotation.types, function(typeItem) {
            return typeItem.label === type;
        });

        if(index < 0) {
            // A document annotation type object contains a label string, whether the annotation type is shown, and the color of the annotation type.
            annotation.types.push({
                label: type,
                shown: true,
                color: _.isEmpty(annotation.colors) ? DEFAULT_HIGHLIGHT_COLOR : (annotation.colors[type] || OTHER_HIGHLIGHT_COLOR)
            });
        }

        return index;
    };

    /**
     * Updates the colors for the types in the given document annotation object and the mentions in the given list of document letter objects.
     * @method updateDocumentAnnotationColors
     * @param {Object} typeField
     * @param {Object} annotation
     * @param {Array} letters
     * @private
     */
    var updateDocumentAnnotationColors = function(typeField, annotation, letters) {
        // After all annotation types have been added, update the colors of the annotation types.
        var typesToHighlightColors = {};

        // Get any color mappings defined in the dashboard configuration file for this annotation.
        var colors = $scope.functions.isFieldValid(typeField) ? $scope.functions.getColorMaps(typeField.columnName) : undefined;

        // Use the color mappings for this annotation if they were defined.
        if(!_.isEmpty(colors)) {
            annotation.types.forEach(function(type) {
                type.color = colors[type.label] || OTHER_HIGHLIGHT_COLOR;
                typesToHighlightColors[type.label] = type.color;
            });
        }

        // Use the default highlight color palette if no color mappings were defined.
        if(_.isEmpty(colors) && annotation.types.length <= HIGHLIGHT_COLORS.length) {
            annotation.types.forEach(function(type, index) {
                type.color = HIGHLIGHT_COLORS[index];
                typesToHighlightColors[type.label] = type.color;
            });
        }

        // Update the highlight colors for the annotation mentions.
        if(Object.keys(typesToHighlightColors).length) {
            letters.forEach(function(letter) {
                letter.mentions.forEach(function(mention) {
                    mention.color = typesToHighlightColors[mention.type];
                });
            });
        }
    }

    /**
     * Saves the details from the given data item in the given document object.
     * @method saveDetails
     * @param {Object} dataItem
     * @param {Object} document
     * @private
     */
    var saveDetails = function(dataItem, document) {
        getValidDetails().forEach(function(detail) {
            // If the detail field contains an array, arbitrarily join the elements of the array to create the detail value.
            var value = neon.helpers.getNestedValues(dataItem, [detail.field.columnName]).map(function(value) {
                return value[detail.field.columnName];
            }).join(",");
            var index = _.findIndex(document.details, function(documentDetail) {
                return documentDetail.label === detail.label;
            });
            if(index < 0) {
                // A detail object contains a label string (specific to the field), a mapping of distinct values to
                // the count of records in which they occur, and a list of the distinct values.
                document.details.push({
                    label: detail.label,
                    valuesToCounts: {},
                    values: []
                });
                index = document.details.length - 1;
            }
            document.details[index].valuesToCounts[value] = (document.details[index].valuesToCounts[value] || 0) + 1;
            // Save the values from the values-to-counts mapping in another property so angular can iterate over them with ng-repeat.
            document.details[index].values = Object.keys(document.details[index].valuesToCounts).sort();
        });
    };

    /**
     * Creates the part objects shown in the display for the given document object using the mention objects from its list of letter objects.
     * @method createDisplayObjects
     * @param {Object} document
     * @private
     */
    var createDisplayObjects = function(document) {
        document.parts = [];

        var endIndex;
        var partText = "";
        var partHighlightColor = undefined;
        var partMentions = [];
        var addPart = function() {
            if(partText) {
                // A part object contains a text string, a description string, a highlight color, and a list of mentions.
                document.parts.push({
                    text: _.escape(partText),
                    desc: partMentions.map(function(partMention) {
                        return (partMention.text || partText) + " (" + partMention.label + (partMention.type ? " " + partMention.type : "") + ")";
                    }).join(", "),
                    highlightColor: partHighlightColor,
                    mentions: partMentions
                });
                partText = "";
                partHighlightColor = undefined;
                // Always create a reference to a new (empty) list.
                partMentions = [];
            }
        };

        document.letters.forEach(function(letter, letterIndex) {
            // Filter out the mentions with annotation types that are hidden by the user for this document.
            var mentions = letter.mentions.filter(function(mention) {
                var annotationItem = _.find(document.annotations, function(annotationItem) {
                    return annotationItem.label === mention.label;
                });
                var typeItem = _.find(annotationItem.types, function(typeItem) {
                    return typeItem.label === mention.type;
                });
                return annotationItem && annotationItem.shown && typeItem && typeItem.shown;
            });

            if(mentions.length) {
                if(!partMentions.length) {
                    addPart();
                }
                var letterEndIndex = Math.max.apply(null, mentions.map(function(mention) {
                    return mention.end;
                }));
                // End the part at the highest character end index of any annotation type from any letter.
                endIndex = endIndex ? Math.max(endIndex, letterEndIndex) : letterEndIndex;
                partText += letter.letter;
                // Add all unique (and shown) annotation types to the list of types represented by this part.
                mentions.forEach(function(mention) {
                    var index = _.findIndex(partMentions, function(partMention) {
                        return partMention.label === mention.label && partMention.field === mention.field && partMention.text === mention.text && partMention.type === mention.type;
                    });
                    if(index < 0) {
                        partMentions.push(mention);
                        // If this part is already using a different highlight color, use the "other" highlight color instead; otherwise use the highlight color for this mention.
                        partHighlightColor = partHighlightColor ? (partHighlightColor === mention.color ? partHighlightColor : OTHER_HIGHLIGHT_COLOR) : mention.color;
                    }
                });
            } else {
                partText += letter.letter;
                // Note that the start and end character index are both inclusive.
                if(letterIndex === endIndex) {
                    addPart();
                    endIndex = undefined;
                }
            }
        });

        // Add the last part to the list.
        addPart();
    };

    $scope.functions.isFilterSet = function() {
        return $scope.filter;
    };

    $scope.functions.getFilterFields = function() {
        return $scope.filter ? $scope.filter.data.map(function(item) {
            return item.field;
        }) : [];
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldNames) {
        var filterClauses = (_.isArray(fieldNames) ? fieldNames : [fieldNames]).map(function(fieldName, index) {
            return neon.query.where(fieldName, $scope.filter.data[index].operator, $scope.filter.data[index].value);
        });
        return filterClauses.length > 1 ? neon.query.or.apply(neon.query, filterClauses) : filterClauses[0];
    };

    $scope.functions.createFilterTrayText = function() {
        return $scope.filter ? $scope.filter.text : "";
    };

    $scope.functions.removeFilterValues = function() {
        $scope.filter = undefined;
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        var finalObject = {
            name: "Document_Viewer",
            data: [{
                query: query,
                name: "documentViewer-" + exportId,
                fields: [],
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };
        finalObject.data[0].fields.push({
            query: (query.fields[0]),
            pretty: (query.fields[0])
        });
        // TODO Add annotations and details.
        return finalObject;
    };

    $scope.functions.createMenuText = function() {
        return ($scope.active.documents.length >= $scope.active.queryDocumentLimit ? "Limited to " : "") + ($scope.active.documents.length || "No") + " Documents";
    };

    $scope.functions.showMenuText = function() {
        return true;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.documentTextField = $scope.functions.isFieldValid($scope.active.documentTextField) ? $scope.active.documentTextField.columnName : undefined;
        bindings.documentLimit = $scope.active.documentLimit;
        bindings.annotationsInAnotherTable = $scope.active.annotationsInAnotherTable;
        bindings.annotationDatabase = $scope.active.annotationDatabase.name;
        bindings.annotationTable = $scope.active.annotationTable.name;
        bindings.documentIdFieldInAnnotationTable = $scope.functions.isFieldValid($scope.active.documentIdFieldInAnnotationTable) ? $scope.active.documentIdFieldInAnnotationTable.columnName : undefined;
        bindings.documentIdFieldInDocumentTable = $scope.functions.isFieldValid($scope.active.documentIdFieldInDocumentTable) ? $scope.active.documentIdFieldInDocumentTable.columnName : undefined;
        bindings.annotations = [];
        bindings.details = [];

        setDefaultAnnotationAndDetailNames();
        $scope.active.annotations.forEach(function(annotation) {
            if($scope.functions.isFieldValid(annotation.startField) && $scope.functions.isFieldValid(annotation.endField)) {
                bindings.annotations.push({
                    startField: annotation.startField.columnName,
                    endField: annotation.endField.columnName,
                    textField: $scope.functions.isFieldValid(annotation.textField) ? annotation.textField.columnName : undefined,
                    typeField: $scope.functions.isFieldValid(annotation.typeField) ? annotation.typeField.columnName : undefined,
                    label: annotation.label
                });
            }
        });
        $scope.active.details.forEach(function(detail) {
            if($scope.functions.isFieldValid(detail.field)) {
                bindings.details.push({
                    field: detail.field.columnName,
                    label: detail.label
                });
            }
        });

        return bindings;
    };

    $scope.handleChangeDocumentTextField = function() {
        $scope.functions.logChangeAndUpdate("documentTextField", $scope.active.documentTextField.columnName);
    };

    $scope.handleChangeDocumentLimit = function() {
        $scope.functions.logChangeAndUpdate("documentLimit", $scope.active.documentLimit, "button");
    };

    $scope.handleChangeAnnotationsInAnotherTable = function() {
        updateAnnotationDatabase();
        $scope.functions.logChangeAndUpdate("annotationsInAnotherTable", $scope.active.annotationsInAnotherTable);
    };

    $scope.handleChangeAnnotationDatabase = function() {
        updateAnnotationTable();
        $scope.functions.logChangeAndUpdate("annotationDatabase", $scope.active.annotationDatabase.name);
    };

    $scope.handleChangeAnnotationTable = function() {
        updateAnnotationFields();
        $scope.functions.logChangeAndUpdate("annotationTable", $scope.active.annotationTable.name);
    };

    $scope.handleChangeDocumentIdFieldInAnnotationTable = function() {
        $scope.functions.logChangeAndUpdate("documentIdFieldInAnnotationTable", $scope.active.documentIdFieldInAnnotationTable.columnName);
    };

    $scope.handleChangeDocumentIdFieldInDocumentTable = function() {
        $scope.functions.logChangeAndUpdate("documentIdFieldInDocumentTable", $scope.active.documentIdFieldInDocumentTable.columnName);
    };

    $scope.removeDetail = function(index) {
        $scope.active.details.splice(index, 1);
    };

    $scope.addDetail = function() {
        $scope.active.details.push({
            field: $scope.functions.createBlankField(),
            label: ""
        });
    };

    $scope.removeAnnotation = function(index) {
        $scope.active.annotations.splice(index, 1);
    };

    $scope.addAnnotation = function() {
        $scope.active.annotations.push({
            startField: $scope.functions.createBlankField(),
            endField: $scope.functions.createBlankField(),
            label: ""
        });
    };

    $scope.getFilterData = function() {
        return $scope.filter ? [$scope.filter] : [];
    };

    $scope.createFilterText = function(filter) {
        return filter ? filter.text : "";
    };

    $scope.createFilterDesc = function(filter) {
        return filter ? filter.data.map(function(item) {
            return item.field.columnName + " contains " + item.value;
        }).join(", ") : "";
    };

    $scope.removeFilter = function() {
        $scope.functions.removeNeonFilter();
    };

    $scope.handleSelectAnnotation = function(annotation) {
        // TODO Logging
        if(annotation.mentions.length) {
            var fields = [];
            $scope.filter = {
                data: annotation.mentions.map(function(mention) {
                    return {
                        field: mention.field,
                        operator: "contains",
                        value: mention.value || annotation.text
                    };
                }),
                text: annotation.text
            };
            $scope.functions.updateNeonFilter();
        }
    };

    $scope.toggleShowAnnotationsLegend = function(document) {
        // TODO Logging
        document.showAnnotationsLegend = !document.showAnnotationsLegend;
    };

    $scope.toggleShowDetailsList = function(document) {
        // TODO Logging
        document.showDetailsList = !document.showDetailsList;
    };

    $scope.toggleFilterOnDocument = function(document) {
        if($scope.isFilterSetOnDocument(document)) {
            $scope.functions.removeNeonFilter();
        } else {
            $scope.filter = {
                data: [{
                    field: $scope.active.documentTextField,
                    operator: "=",
                    value: document.content
                }],
                text: document.content
            };
            $scope.functions.updateNeonFilter();
        }
    };

    $scope.isFilterSetOnDocument = function(document) {
        return $scope.filter && $scope.filter.data.length === 1 && $scope.filter.data[0].field === $scope.active.documentTextField && $scope.filter.data[0].operator === "=" &&
            $scope.filter.data[0].value === document.content;
    };

    $scope.toggleShowAnnotation = function(document, annotation) {
        // TODO Logging
        annotation.types.forEach(function(type) {
            type.shown = annotation.shown;
        });
        createDisplayObjects(document);
    };

    $scope.toggleShowAnnotationType = function(document) {
        // TODO Logging
        createDisplayObjects(document);
    };
}]);
