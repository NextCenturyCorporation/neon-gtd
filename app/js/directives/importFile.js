'use strict';
/*
 * Copyright 2015 Next Century Corporation
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
 * This Angular JS directive adds a simple button to a page that allows the user to upload a file to the server.
 *
 * @namespace neonDemo.directives
 * @constructor
 */

angular.module('neonDemo.directives')
.directive('importFile', ['ConnectionService', 'ErrorNotificationService',
    function(connectionService, errorNotificationService) {
    return {
        templateUrl: 'partials/directives/importFile.html',
        restrict: 'EA',
        link: function($scope) {
            // Check if the browser has the functionality needed to support this implementation of import. There shouldn't
            // be any that don't, at this point, but it doesn't hurt to check anyway.
            $scope.canImport = (window.File && window.FileReader && window.FileList && window.Blob);
            // List of field/type pairs for current data.
            $scope.fieldTypePairs;
            // Stores whether the confirm choices modal should display the failure information message.
            $scope.hasFailed;
            // Maximum size of file to accept, in bytes.
            var MAX_SIZE = 30000000;
            // File to upload.
            var file = undefined;
            // Unique identifier of current data set - used for dropping data.
            var identifier;

            $scope.uploadFile = function() {
                var connection = connectionService.getActiveConnection();
                if(!connection || !file) {
                    return;
                }
                var formData = new FormData();
                formData.append("file", file);
                connection.executeUploadFile(formData, function(data) {
                    var result = JSON.parse(data); // ExecuteUploadFile doesn't automatically parse it for us because it doesn't go through jQuery ajax.
                    identifier = result.identifier;
                    $scope.fieldTypePairs = result.types;
                    $scope.hasFailed = false;
                    jQuery("#confirmChoicesModal").modal("show");
                    document.getElementById("dataDropped").innerHTML = "Drop Current Data";
                    $scope.$apply();
                    setupDropdowns();
                }, function(response) {
                    window.alert("Failed to upload.")
                    /*if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }*/
                });
            }

            $scope.dropCurrentSet = function() {
                var connection = connectionService.getActiveConnection();
                if(!connection || !identifier) {
                    return;
                }
                connection.executeDropData(identifier, function(response) {
                    document.getElementById("dataDropped").innerHTML = (response.success) ? "Data set dropped" : "Failed to drop data";
                    identifier = undefined;
                });
            };

            // For some reason or another, on small data sets the processing and return of fields is happening so quickly the modal can't actually finish closing before it reopens (if one or more fields failed).
            // This results in multiple modal backdrops being opened - the old one from before closing, and the new one from reopening. Closing the modal again only gets rid of one of these.

            $scope.sendConfirmedChoices = function() {
                var connection = connectionService.getActiveConnection();
                if(!connection || !identifier || !$scope.fieldTypePairs) {
                    return
                }
                var fieldTypeArray = [];
                $scope.fieldTypePairs.forEach(function(pair) {
                    // We do this because the scope variable has some sort of extra hash field on it that we don't want to send.
                    fieldTypeArray.push({
                        name: pair.name,
                        type: pair.type
                    });
                });
                var datePattern = jQuery("#dateStringInput")[0].value
                var toSend = {
                    format: (datePattern.length > 0) ? datePattern : undefined,
                    fields: fieldTypeArray
                };
                connection.executeConfirmTypeGuesses(toSend, identifier, function(response) { // With any luck, this will keep the odd double-backdrop bug from occurring.
                    jQuery("#confirmChoicesModal").modal("hide");
                }, function(response) {
                    $scope.fieldTypePairs = response.responseJSON;
                    $scope.hasFailed = true;
                    $scope.$apply();
                    setupDropdowns();
                });
            };

            var displayFileInfo = function(file) {
                document.getElementById("selectedFileIndicator").innerHTML = (file === undefined) ? "No file selected" : 
                    (file.size > MAX_SIZE) ? "File too large - size limit is " + sizeToReadable(MAX_SIZE) : file.name + " - " + sizeToReadable(file.size);
            }

            /*
             * Helper method that converts a number of bytes into a human-readable format.
             * @param size {Number} The number to convert into a human-readable form.
             * @return {String} A human-readable version of the given number, with byte units.
             */
            var sizeToReadable = function(size) {
                var nameList = ["bytes", "kB", "mB", "gB", "tB", "pB"];
                var name = 0;
                while(size > 1000) {
                    size /= 1000;
                    name++;
                }
                return (Math.round(size * 10) / 10) + " " + nameList[name];
            };

            // Defines an event handler for drop down menus in the field type confirmation modal.
            var confirmChoicesDropdownChange = function(evnt) {
                evnt.stopPropagation();
                var name = evnt.target.id.split("-")[0];
                var value = evnt.target.value;
                $scope.fieldTypePairs.forEach(function(pair) {
                    if(pair.name === name) {
                        pair.type = value;
                    }
                });
            };

            /*
             * Initializes the dropdown menus in the field type confirmation modal to be what the server guessed, as well as adding change handlers
             * that keep the types in the scope up to date with the types in the menus.
             */
            var setupDropdowns = function() {
                $scope.fieldTypePairs.forEach(function(pair) {
                    var dropdown = document.getElementById(pair.name+"-options");
                    dropdown.value = pair.type;
                    dropdown.addEventListener("change", confirmChoicesDropdownChange, false);
                });
            };

            // Define some event handlers and attach them to elements in the import file modal.

            var importModalDragEnter = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
            };

            var importModalDragOver = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                evnt.dataTransfer.dropEffect = "copy";
            };

            var importModalDrop = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                var data = evnt.dataTransfer;
                file = data.files[0];
                displayFileInfo(file);
            };

            var importModalOnFileSelectChange = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                file = fileSelector.files[0];
                displayFileInfo(file);
            };

            var importModalOnHidden = function(evnt) {
                file = undefined;
                displayFileInfo(file);
            };

            // Set behavior of drag and drop element within import file modal.
            var dragDrop = document.getElementById("fileDragAndDrop");
            dragDrop.addEventListener("dragenter", importModalDragEnter, false);
            dragDrop.addEventListener("dragover", importModalDragOver, false);
            dragDrop.addEventListener("drop", importModalDrop, false);
            // Set behavior of file selector element within import file modal.
            var fileSelector = document.getElementById("fileSelect");
            fileSelector.addEventListener("dragenter", importModalDragEnter, false);
            fileSelector.addEventListener("dragover", importModalDragOver, false);
            fileSelector.addEventListener("drop", importModalDrop, false);
            fileSelector.addEventListener("change", importModalOnFileSelectChange, false);
            // Clear selected file and reset text when import modal is hidden.
            jQuery("#importModal").on("hidden.bs.modal", importModalOnHidden);
            // Hide the text portion of the file selector element -  we have our own, and it doesn't update when the modal closes and reopens.
            jQuery("#fileSelect").css("color", "transparent");
        }
    };
}]);