﻿using AutoMapper;
using Dapper;
using DataAccessLibrary.DataModels.EditModels;
using DataAccessLibrary.Enums;
using DataAccessLibrary.UserModels;
using Ganss.XSS;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.JSInterop;
using MySqlConnector;
using Syncfusion.Blazor.Calendars;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ThinBlueLie.Helper;
using ThinBlueLie.Helper.Extensions;
using ThinBlueLie.Models;
using static ThinBlueLie.Helper.Algorithms.WebsiteProfiling.WebsiteProfile;
using static ThinBlueLie.Searches.SearchClasses;

namespace ThinBlueLie.Pages
{
    public partial class Submit
    {

        [Inject] NavigationManager NavManager { get; set; }
        [Inject] SignInManager<ApplicationUser> SignInManager { get; set; }
        [Inject] UserManager<ApplicationUser> UserManager { get; set; }
        [Inject] IJSRuntime JS { get; set; }
        public AuthenticationState userState;
        public bool SavingData { get; set; }
        [CascadingParameter] Task<AuthenticationState> AuthState { get; set; }

        protected override async Task OnInitializedAsync()
        {
            userState = await AuthState;
            if (userState.User.Identity.IsAuthenticated)
            {
                SimilarOfficers.Add(new List<SimilarPersonGeneral> { });
                SimilarSubjects.Add(new List<SimilarPersonGeneral> { });
                SimilarEvents = await SearchesSubmit.GetSimilar(DateTime.Today.ToString("yyyy-MM-dd"));
            }
        }
        protected async override Task OnAfterRenderAsync(bool firstRender)
        {
            if (!firstRender)
            {
                await JS.InvokeVoidAsync("MakeMobileFriendly");
            }
            else
            {
                await JS.InvokeVoidAsync("feather.replace");
            }
        }
        protected async Task HandleValidSubmitAsync()
        {
            //display loading gif in modal while doing the processing
            //TODO add locked option in form for authed users with perms
            SavingData = true;
            this.StateHasChanged();
            model.Timelineinfos.Locked = 0;
            string? userId;
            if (SignInManager.IsSignedIn(userState.User))
                userId = UserManager.GetUserId(userState.User);
            else
                userId = null;

            EditHistory editHistory = new();
            //TODO if user is has perms auto verify
            int IdTimelineinfo;
            int EditHistoryId;
            var sanitizer = new HtmlSanitizer();
            using (var connection = new MySqlConnection(ConfigHelper.GetConnectionString()))
            {
                connection.Open();

                string createNewEditHistory = @"INSERT INTO edithistory (`Confirmed`, `SubmittedBy`) 
                                                        VALUES ('2', @userId);
                                            SELECT LAST_INSERT_ID();
                                            SET @v1 = (SELECT COALESCE(Max(e.IdTimelineinfo +1), 1) FROM edithistory e);
                                            SELECT @v1;";
                using (var multi = await connection.QueryMultipleAsync(createNewEditHistory, new { userId }))
                {
                    EditHistoryId = editHistory.IdEditHistory = multi.Read<int>().FirstOrDefault();
                    IdTimelineinfo = multi.Read<int>().FirstOrDefault();
                    editHistory.IdTimelineinfo = IdTimelineinfo;
                }


                string timelineSave = $@"INSERT INTO edits (`IdTimelineinfo`, `IdEditHistory`, `Title`, `Date`, `State`, `City`, `Context`, `Locked`)
                                       VALUES ('{IdTimelineinfo}', '{EditHistoryId}', @Title, @Date, @State, @City, @context, @Locked);";   

                //Insert data into edits table
                await connection.QueryAsync<int>(timelineSave, new
                {                    
                    Title = model.Timelineinfos.Title.Trim(),
                    Date = DateValue,
                    model.Timelineinfos.State,
                    City = model.Timelineinfos.City.Trim(),
                    context = sanitizer.Sanitize(model.Timelineinfos.Context),
                    model.Timelineinfos.Locked,
                    submittedby = userId, //nullable
                });
                editHistory.Edits = 1;

                foreach (var media in model.Medias)
                {
                    string path;
                    //if there is a file for the media save it to disk
                    if (media.Source != null & media.SourceFrom == MediaEnums.SourceFromEnum.Device)
                    {
                        var rand = StringExtensions.RandomString(20); //random string of 20 characters
                        path = @".\wwwroot\Uploads\" + rand + ".jpg";
                        FileStream filestream = new FileStream(path, FileMode.Create, FileAccess.Write);
                        media.Source.Stream.WriteTo(filestream);
                        filestream.Close();
                        media.Source.Stream.Close();
                        media.SourcePath = rand;
                    }
                    else
                    {
                        path = media.SourcePath;
                    }

                    if (media.SourcePath == media.Thumbnail)
                        media.Thumbnail = null;
                    if (media.SourcePath == media.OriginalUrl)
                        media.OriginalUrl = null;

                    media.Blurb = media.Blurb.Trim();
                    media.IdTimelineinfo = IdTimelineinfo;
                    string mediaSql = $@"INSERT INTO editmedia (`IdEditHistory`, `IdTimelineinfo`, `MediaType`, `SourcePath`, `Thumbnail`, `OriginalUrl`,
                                            `Gore`, `SourceFrom`, `Blurb`, `Credit`, `SubmittedBy`, `Rank`, `Action`)
                                    VALUES ('{EditHistoryId}', @IdTimelineinfo, @MediaType, @SourcePath, @Thumbnail, @OriginalUrl,
                                            @Gore, @SourceFrom, @Blurb, @Credit, '{userId}', '{media.Rank}', '0');";
                    await connection.ExecuteAsync(mediaSql, media);
                    editHistory.EditMedia = 1;
                }

                //Subject Table
                foreach (var subject in model.Subjects)
                {
                    int IdSubject = 0;
                    subject.Name = subject.Name.Trim();
                    if (subject.SameAsId == null)
                    {
                        //Create new subject
                        var subjectSql = $@"SET @v1 = (SELECT COALESCE(Max(e.IdSubject +1),1) FROM edits_subject e);                                               
                                            INSERT INTO edits_subject 
                                              (`IdEditHistory`, `IdSubject`, `Name`, `Race`, `Sex`, `Action`)
                                               VALUES ('{EditHistoryId}', @v1, @Name, @Race, @Sex, '0');
                                            SELECT @v1;";
                        //Add to subjects table and return id
                        IdSubject = await connection.QuerySingleAsync<int>(subjectSql, subject);
                        editHistory.Subjects = 1;
                    }
                    //Add to junction table    
                    var junctionSql = @"INSERT INTO edits_timelineinfo_subject (`IdEditHistory`, `IdTimelineinfo`, `IdSubject`, `Armed`, `Age`)
                                        VALUES (@EditHistoryId, @IdTimelineinfo, @IdSubject, @Armed, @Age);";
                    await connection.ExecuteAsync(junctionSql, new
                    {
                        EditHistoryId,
                        IdTimelineinfo,
                        IdSubject = subject.SameAsId == null? IdSubject : subject.SameAsId,
                        Armed = Convert.ToByte(subject.Armed),
                        subject.Age
                    });
                    editHistory.Timelineinfo_Subject = 1;
                }
                //Officer Table
                foreach (var officer in model.Officers)
                {
                    int IdOfficer = 0;
                    officer.Name = officer.Name.Trim();
                    if (officer.SameAsId == null)
                    {
                        //Create new officer
                        var officerSql = $@"SET @v1 = (SELECT COALESCE(Max(e.IdOfficer + 1),1) FROM edits_officer e);                                              
                                            INSERT INTO edits_officer (`IdEditHistory`, `IdOfficer`, `Name`, `Race`, `Sex`, `Action`)
                                               VALUES ('{EditHistoryId}', @v1, @Name, @Race, @Sex, '0');
                                            SELECT @v1;";
                        //Add to officers table and return id
                        IdOfficer = await connection.QuerySingleAsync<int>(officerSql, officer);
                        editHistory.Officers = 1;
                    }
                    //Add to junction table
                    var junctionSql = "INSERT INTO edits_timelineinfo_officer (`IdEditHistory`, `IdTimelineinfo`, `IdOfficer`, `Age`, `Misconduct`, `Weapon`)" +
                                    "VALUES (@EditHistoryId, @IdTimelineinfo, @idofficer, @age, @misconduct, @weapon);";
                    await connection.ExecuteAsync(junctionSql, new
                    {
                        EditHistoryId,
                        IdTimelineinfo,
                        idofficer = officer.SameAsId == null? IdOfficer : officer.SameAsId,
                        age = officer.Age,
                        misconduct = officer.Misconduct.Sum(),
                        weapon = officer.Weapon?.Sum() == 0? null : officer.Weapon?.Sum(),
                    });
                    editHistory.Timelineinfo_Officer = 1;
                }
                string updateEditHistory = @$"UPDATE edithistory SET 
                                                `IdTimelineinfo` = @IdTimelineinfo,
                                                `Confirmed` = '0',`Edits` = @Edits, `EditMedia` = @EditMedia,
                                                `Officers` = @Officers, `Subjects` = @Subjects, `Timelineinfo_Officer` = @Timelineinfo_Officer, 
                                                `Timelineinfo_Subject` = @Timelineinfo_Subject 
                                            WHERE (`IdEditHistory` = '{EditHistoryId}');";
                await connection.ExecuteAsync(updateEditHistory, editHistory);
            }
            Serilog.Log.Information("Created new Event {@EventInfo} with EditHistory Id {EditHistoryId}", model, EditHistoryId);
            Serilog.Log.Information("Created new Edit {@EditHistory}", editHistory);

            //Give account some repuation
            await UserManager.ChangeReputation(ReputationEnum.ReputationChangeEnum.NewEvent, Convert.ToInt32(userId));

            //TODO move all into querymultiple
            if (true) //TODO check if successful submit
            {
                NavManager.NavigateTo("/Account/Profile");
            }
            SavingData = false;
        }
        public List<ViewSimilar>? SimilarEvents { get; set; } = new List<ViewSimilar>();
        protected async void FindEvents(ChangedEventArgs<DateTime?> args)
        {
            model.Timelineinfos.Date = Convert.ToDateTime(DateValue);
            SimilarEvents = await SearchesSubmit.GetSimilar(args.Value?.ToString("yyyy-MM-dd"));
            this.StateHasChanged();
        }
    }
}