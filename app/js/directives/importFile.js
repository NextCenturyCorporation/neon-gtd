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
 * This Angular JS directive adds a button to a page that triggers a modal, which allows the user to upload a file to the server.
 *
 * @namespace neonDemo.directives
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('importFile', ['ConnectionService', 'ErrorNotificationService', 'ImportService',
    function(connectionService, errorNotificationService, importService) {
    return {
        templateUrl: 'partials/directives/importFile.html',
        restrict: 'EA',
        link: function($scope, $element) {
            $scope.canImport = (window.File && window.FileReader && window.FileList && window.Blob);
            $scope.nameTypePairs = undefined;
            $scope.currentJobID = undefined;
            $scope.importUserName = '';
            $scope.importDatabaseName = '';
            $scope.dateFormatString = '';
            $scope.indicatorText = "No file selected";
            $scope.isConverting = false;
            $scope.convertingMessage = "";
            var file;
            var pollDelay = 1500;

            /**
             * Sends the initial upload to the server. This request contains the given user and database names,
             * as well as the type of file being uploaded (gotten from the file itself) and the raw binary data
             * that is the file to import. Triggers either a success callback or an error callback.
             * @method $scope.uploadFile
             */
            $scope.uploadFile = function() {
                importService.setUserName($scope.importUserName);
                importService.setDatabaseName($scope.importDatabaseName);
                var connection = connectionService.getActiveConnection();
                if(!connection || !file) {
                    return;
                }
                var formData = new FormData();
                formData.append('user', $scope.importUserName);
                formData.append('data', $scope.importDatabaseName);
                formData.append('type', file.name.substring(file.name.lastIndexOf('.') + 1));
                formData.append('file', file);
                connection.executeUploadFile(formData, uploadSuccess, uploadFailure);
                $scope.importDatabaseName = '';
                file = undefined;
                displayFileInfo();
            };

            // TODO - window.alert technically works here, but isn't necessarily the prettiest solution.
            // Should change this to use the errorNotificationService at some point - it's only not doing
            // that now because the error shows up in the options menu rather than the modal for some reason.
            /**
             * Failure callback for $scope.uploadFile, in case it fails for some reason. Displays an error message saying what went wrong.
             * @method uploadFailure
             * @param {Object} response The server's response.
             */
            var uploadFailure = function(response) {
                window.alert(JSON.stringify(response));
            };

            /**
             * Success callback for $scope.uploadFile. Gets the jobID associated with the file, and begins the
             * polling loop for the guesses as to the file's fields and their types.
             * @method uploadSuccess
             * @param {Object} response The server's response.
             */
            var uploadSuccess = function(response) {
                var result = JSON.parse(response);
                var jobID = result.jobID;
                waitForGuesses(jobID);
            };

            /**
             * Polls the server to check on the status of finding fields and guessing types for the file with the given job ID.
             * @method waitForGuesses
             * @param {String} jobID The job ID associated with the file to check on.
             */
            var waitForGuesses = function(jobID) {
                var connection = connectionService.getActiveConnection();
                if(!connection || !jobID) {
                    return;
                }
                connection.executeCheckTypeGuesses(jobID, waitForGuessesCallback);
            };

            /**
             * The callback triggered when the poll for type guesses finishes. Shows the cinfirm type guesses dialog if the guesses
             * were returned, and delays for a moment before re-polling otherwise.
             * @method waitForGuessesCallback
             * @param {Object} response The response from the server. Contains whether the type guessing is done, the type guesses if
             * any, and the job ID associated with the file to be used for re-polling if necessary.
             */
            var waitForGuessesCallback = function(response) {
                if(response.complete) {
                    $scope.nameTypePairs = response.guesses;
                    $scope.currentJobID = response.jobID;
                     // Angular doesn't automatically recognize when this changes, so we force it to manually.

                    $scope.$apply();
                    showConfirmGuessesModal();
                } else {
                    window.setTimeout(function() {
                        waitForGuesses(response.jobID);
                    }, pollDelay);
                }
            };

            /**
             * Sends the user-decided list of fields and their types to the server, once the user has selected them, as well
             * as a user-defined date formatting string if one was entered. then begins to display progress of importing and
             * converting records. Triggers either a success callback or an error callback.
             * @method $scope.sendConfirmedChoices
             * @param {String} value An optional parameter, only given if the user closes the modal using the X button at the
             * top right. Calls this method, but sets all field types to be string, for conversion safety purposes since the
             * user won't be able to fix mistakes like they would if the modal was still up.
             */
            $scope.sendConfirmedChoices = function(value) {
                var connection = connectionService.getActiveConnection();
                if(!connection || !$scope.nameTypePairs) {
                    return;
                }
                var ftPairs = importService.getFieldsAndTypes($scope.nameTypePairs);
                if(value && value === 'STRING') {
                    ftPairs.forEach(function(pair) {
                        pair.type = 'STRING';
                    });
                }
                var toSend = {
                    format: $scope.dateFormatString ? $scope.dateFormatString : undefined,
                    fields: ftPairs
                };
                connection.executeLoadFileIntoDB(toSend, $scope.currentJobID, confirmChoicesSuccess, confirmChoicesFailure);
                $element.find("#confirmChoicesButton").addClass("disabled");
                // Preferably, job ID here would be passed directly from the last time the guesses callback fired, but for now I'll just store it as a variable.
                // (Getting it straight from the last method to use it would be preferable just to continue everything in a nice chain.)
                $scope.isConverting = true;
                $scope.convertingMessage = "Records converted: 0";
            };

            /**
             * Success callback for $scope.sendConfirmedChoices. Begins the polling loop to wait for the import to complete.
             * @method confirmChoicesSuccess
             * @param {Object} response The server's response.
             */
            var confirmChoicesSuccess = function(response) {
                waitForImportComplete(response.jobID);
            };

            // TODO - window.alert technically works here, but isn't necessarily the prettiest solution.
            // Should change this to use the errorNotificationService at some point - it's only not doing
            // that now because the error shows up in the options menu rather than the modal for some reason.
            /**
             * Failure callback for $scope.sendConfirmedChoices. Shows an error message saying what went wrong.
             * @method confirmChoicesFailure
             * @param {Object} response The server's response.
             */
            var confirmChoicesFailure = function(response) {
                $element.find("#confirmChoicesButton").removeClass("disabled");
                window.alert(JSON.stringify(response.responseJSON));
            };

            /**
             * Polls the server to check if it's done importing and converting records from the file associated with
             * the given job ID. Triggers a callback.
             * @method waitForImportComplete
             * @param {String} jobID The job ID associated with the file whose import status to check on.
             */
            var waitForImportComplete = function(jobID) {
                var connection = connectionService.getActiveConnection();
                if(!connection || !jobID) {
                    return;
                }
                connection.executeCheckImportProgress(jobID, waitForImportCompleteCallback);
            };

            /**
             * Callback for waitForImportComplete. If the import operation is complete, either hides the confirm type guesses
             * modal or adjusts the list of fields depending on whether or not any failed to convert. If the import operation
             * is not complete, waits a specified amount of time and then re-calls waitForImportComplete.
             * @method waitForImportCompleteCallback
             * @param {Object} response The server's response.
             */
            var waitForImportCompleteCallback = function(response) {
                if(response.complete) {
                    $element.find("#confirmChoicesButton").removeClass("disabled");
                    $scope.isConverting = false;
                     // Angular doesn't automatically recognize when this changes, so we force it to manually.

                    $scope.$apply();
                    if(response.failedFields.length > 0) {
                        $scope.nameTypePairs = response.failedFields;
                         // Angular doesn't automatically recognize when this changes, so we force it to manually.

                        $scope.$apply();
                        $element.find('#convertFailedText').show();
                        setupConfirmGuessesModalInfo();
                    } else {
                        $element.find("#confirmChoicesModal").modal('hide');
                    }
                } else {
                    if(response.numCompleted < 0) {
                        return; // numCompleted only returns as <0 if the data that the user is trying to convert doesn't exist anymore.
                    }
                    $scope.convertingMessage = "Records converted: " + response.numCompleted;
                    // Angular doesn't automatically recognize when this changes, so we force it to manually.

                    $scope.$apply();
                    window.setTimeout(function() {
                        waitForImportComplete(response.jobID);
                    }, pollDelay);
                }
            };

            /**
             * Does a bit of setup and then shows the confirm type guesses modal dialog.
             * @method showConfirmGuessesModal
             */
            var showConfirmGuessesModal = function() {
                $scope.dateFormatString = importService.getDateString();
                // Angular doesn't automatically recognize when this changes, so we force it to manually.
                $scope.$apply();
                $element.find('#convertFailedText').hide();
                $element.find('#confirmChoicesModal').modal('show');
                setupConfirmGuessesModalInfo();
            };

            /**
             * Method to be called whenever the selected value of a dropdown in the confirm type guesses modal changes. Updates
             * the type of the associated fieldname/type pair. Also updates the example to match the new selected type.
             * @method confirmChoicesDropdownChange
             * @param {Event} evnt The onchange event that was triggered when the selected value of the dropdown changed.
             */
            var confirmChoicesDropdownChange = function(evnt) {
                evnt.stopPropagation();
                var name = evnt.target.id.split("-")[0];
                var value = evnt.target.value;
                $scope.nameTypePairs.forEach(function(pair) {
                    if(pair.name === name) {
                        pair.type = value;
                    }
                });
                var example = $element.find("#" + name + "-example")[0];
                // Setting innerHTML directly rather than binding to a $scope field because this element is dynamically generated.
                example.innerHTML = getExampleFromTypeName(value);
            };

            /**
             * Sets up the initial values in the table of field names to type selectors and adds an event listener to them
             * that calls confirmChoicesDropdownChange when their value changes.
             * @method setupConfirmGuessesModalInfo
             */
            var setupConfirmGuessesModalInfo = function() {
                $scope.nameTypePairs.forEach(function(pair) {
                    var dropdown = $element.find("#" + pair.name + "-options")[0];
                    dropdown.value = pair.type;
                    dropdown.addEventListener("change", confirmChoicesDropdownChange, false);
                    var example = $element.find("#" + pair.name + "-example")[0];
                    // Setting innerHTML directly rather than binding to a $scope field because this element is dynamically generated.
                    example.innerHTML = getExampleFromTypeName(pair.type);
                });
            };

            /**
             * Displays the info of the file currently selected for upload. If the file is too large or non-existent, instead displays
             * a message that indicates that. Also if the file is too large, sets the selected file variable to undefined so that the
             * too-large file can't simply be uploaded anyway.
             * @method displayFileInfo
             */
            var displayFileInfo = function() {
                if(!file) {
                    $scope.indicatorText = "No file selected";
                    return;
                } else if(file.size > importService.getMaxSize(false)) {
                    $scope.indicatorText = "File too large - size limit is " + importService.getMaxSize(true);
                    file = undefined;
                } else {
                    $scope.indicatorText = file.name + " - " + importService.sizeToReadable(file.size);
                }
                if($scope.importDatabaseName == '' && file) {
                    $scope.importDatabaseName = file.name.substring(0, file.name.lastIndexOf('.'));
                }
                 // Angular doesn't automatically recognize when this changes, so we force it to manually.
 
                $scope.$apply();
            };

            /**
             * Given the name of a data type, gives an example value of that type.
             * @method getExampleFromTypeName
             * @param {String} name The name of the data type to get an example for.
             */
            var getExampleFromTypeName = function(name) {
                switch(name) {
                    case "INTEGER": {
                        return "1125";
                    }
                    case "LONG": {
                        return "1234567890987654321";
                    }
                    case "DOUBLE": {
                        return "1.125";
                    }
                    case "FLOAT": {
                        return "1.234567890987654321";
                    }
                    case "DATE": {
                        return "2012-12-21T07:08:09.123Z";
                    }
                    case "STRING": {
                        return "\"The quick brown fox.\"";
                    }
                    default: {
                        return "No example available; invalid type.";
                    }
                }
            };

            /**
             * =====================================================================================================================
             * Define some behaviors for objects in the import modal and the import modal itself.
             * =====================================================================================================================
             */

            /**
             * Blocks default dragenter behavior. Used for enabling drag-and-drop of files.
             * @method importModalDragEnter
             * @param {Event} evnt The event to block.
             */
            var importModalDragEnter = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
            };

            /**
             * Blocks default dragover behavior, as well as changing the cursor to the "copy" cursor.
             * Used for enabling drag-and-drop of files.
             * @method importModalDragOver
             * @param {Event} evnt The event to block and override.
             */
            var importModalDragOver = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                evnt.dataTransfer.dropEffect = "copy";
            };

            /**
             * Blocks default drop behavior, as well as setting the file variable to the first file dropped, if any.
             * @method importModalDrop
             * @param {Event} evnt The event to block and override.
             */
            var importModalDrop = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                var data = evnt.dataTransfer;
                file = data.files[0];
                displayFileInfo();
            };

            /**
             * Blocks the default onchange dehavior of an element, as well as setting the file variable to the first file in the
             * event's list, if possible. Used to override default file input behavior and make the files selected accessible.
             * @method importModalFileSelectChange
             * @param {Event} evnt The event to block and override.
             */
            var importModalFileSelectChange = function(evnt) {
                evnt.stopPropagation();
                evnt.preventDefault();
                file = fileSelector.files[0];
                displayFileInfo();
            };

            // Set behavior of drag and drop element within import file modal.
            var dragDrop = $element.find("#fileDragAndDrop")[0];
            dragDrop.addEventListener("dragenter", importModalDragEnter, false);
            dragDrop.addEventListener("dragover", importModalDragOver, false);
            dragDrop.addEventListener("drop", importModalDrop, false);
            // Set behavior of file selector element within import file modal.
            var fileSelector = $element.find("#fileSelect")[0];
            fileSelector.addEventListener("dragenter", importModalDragEnter, false);
            fileSelector.addEventListener("dragover", importModalDragOver, false);
            fileSelector.addEventListener("drop", importModalDrop, false);
            fileSelector.addEventListener("change", importModalFileSelectChange, false);
            // Hide the text portion of the file selector element -  we have our own, and it doesn't update when the modal closes and reopens.
            $element.find("#fileSelect").css("color", "transparent");
        }
    };
}]);