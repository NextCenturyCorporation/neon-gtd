'use strict';

module.exports = function(grunt) {
    var packageJSON = require('./package.json');

    grunt.initConfig({
        jshint: {
            options: {
                jshintrc: '.jshintrc',
                force: true
            },
            console: [
                'Gruntfile.js',
                'app/js/*.js',
                'app/js/**/*.js',
                'test/**/*.js',
                '!app/js/vendor/**/*.js'
            ],
            xml: {
                options: {
                    reporter: "jslint",
                    reporterOutput: "reports/jslint.xml"
                },
                files: {
                    src: [
                        'Gruntfile.js',
                        'app/js/*.js',
                        'app/js/**/*.js',
                        'test/**/*.js',
                        '!app/js/vendor/**/*.js'
                    ]
                }
            }
        },

        jscs: {
            options: {
                config: ".jscsrc",
                excludeFiles: ["app/js/vendor/**/*.js"],
                force: true
            },
            console: {
                options: {
                    reporter: 'console'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            },
            xml: {
                options: {
                    reporterOutput: 'reports/jscs.xml',
                    reporter: 'checkstyle'
                },
                files: {
                    src: ['Gruntfile.js', 'app/js/**/*.js', 'test/**/*.js']
                }
            }
        },

        bower: {
            cleanup: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: false,
                    copy: false
                }
            },
            install: {
                options: {
                    targetDir: "app/lib",
                    layout: "byComponent",
                    cleanTargetDir: true,
                    cleanBowerDir: true,
                    install: true,
                    copy: true
                }
            }
        },

        karma: {
            unit: {
                options: {
                    configFile: 'karma.conf.js'
                }
            }
        },

        clean: ["app/lib", "docs", "target", "reports"],

        /*
         * Build a WAR (web archive) without Maven or the JVM installed.
         */
        war: {
            target: {
                options: {
                    war_dist_folder: "target",
                    war_verbose: true,
                    war_name: 'neon-gtd-' + packageJSON.version,
                    webxml_welcome: 'index.html',
                    webxml_display_name: packageJSON.shortDescription,
                    webxml_mime_mapping: [{
                        extension: 'woff',
                        mime_type: 'application/font-woff'
                    }]
                },
                files: [
                    {
                        expand: true,
                        cwd: ".",
                        src: ["app/**"],
                        dest: ""
                    }
                ]
            }
        },

        yuidoc: {
            compile: {
                name: packageJSON.shortDescription,
                description: packageJSON.description,
                version: packageJSON.version,
                url: packageJSON.repository.url,
                logo: '../app/img/Neon_60x34.png',
                options: {
                    paths: 'app/js',
                    outdir: 'docs'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-bower-task');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jscs');
    grunt.loadNpmTasks('grunt-karma');
    grunt.loadNpmTasks('grunt-contrib-yuidoc');
    grunt.loadNpmTasks('grunt-war');

    grunt.registerTask('test', ['jshint:console', 'jscs:console', 'karma']);
    grunt.registerTask('default', ['clean', 'bower:install', 'jshint:xml', 'jscs:xml', 'yuidoc', 'war']);
};
